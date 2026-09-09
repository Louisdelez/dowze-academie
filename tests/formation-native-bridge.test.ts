import assert from "node:assert/strict";
import test from "node:test";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import {
  openCalendarInSystem,
  pickFormationPackage,
  readFormationPackageBrowserFiles,
  saveCalendarIcs,
  saveFormationKitArchive
} from "../src/lib/tauri.ts";

const REQUIRED_FILES = [
  "formation.json",
  "matieres.json",
  "programme.json",
  "planning.json",
  "evaluations.json",
  "taches.json"
] as const;

function browserFile(
  name: string,
  bytes: Uint8Array,
  relativePath = `dowze-formation-test/${name}`,
  declaredSize = bytes.byteLength
) {
  return {
    name,
    size: declaredSize,
    webkitRelativePath: relativePath,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  };
}

function validFiles(content = "{}") {
  const bytes = new TextEncoder().encode(content);
  return REQUIRED_FILES.map((name) => browserFile(name, bytes));
}

test("le lecteur navigateur restitue les six fichiers racine et ignore la documentation imbriquée", async () => {
  const files = [
    ...validFiles('{"schemaVersion":"dowze-formation@1"}'),
    browserFile(
      "formation.schema.json",
      new TextEncoder().encode("{}"),
      "dowze-formation-test/schemas/formation.schema.json"
    )
  ];

  const result = await readFormationPackageBrowserFiles(files);

  assert.equal(result.directoryName, "dowze-formation-test");
  assert.deepEqual(
    REQUIRED_FILES.map((name) => JSON.parse(result[name]).schemaVersion),
    REQUIRED_FILES.map(() => "dowze-formation@1")
  );
});

test("le lecteur navigateur refuse un JSON racine inattendu, un lot incomplet ou plusieurs racines", async () => {
  await assert.rejects(
    readFormationPackageBrowserFiles([
      ...validFiles(),
      browserFile("bonus.json", new TextEncoder().encode("{}"))
    ]),
    /JSON inattendu/
  );
  await assert.rejects(readFormationPackageBrowserFiles(validFiles().slice(1)), /six fichiers JSON obligatoires/);

  const mixed = validFiles();
  mixed[5] = browserFile("taches.json", new TextEncoder().encode("{}"), "autre-dossier/taches.json");
  await assert.rejects(readFormationPackageBrowserFiles(mixed), /dossier de formation incohérent/);
});

test("le lecteur navigateur applique UTF-8, JSON et les mêmes bornes 2/8 Mio que le natif", async () => {
  const invalidUtf8 = validFiles();
  invalidUtf8[0] = browserFile("formation.json", new Uint8Array([0xff]));
  await assert.rejects(readFormationPackageBrowserFiles(invalidUtf8), /encodé en UTF-8/);

  const invalidJson = validFiles();
  invalidJson[0] = browserFile("formation.json", new TextEncoder().encode("pas du JSON"));
  await assert.rejects(readFormationPackageBrowserFiles(invalidJson), /JSON invalide/);

  const bomJson = validFiles();
  bomJson[0] = browserFile(
    "formation.json",
    new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d])
  );
  await assert.rejects(readFormationPackageBrowserFiles(bomJson), /JSON invalide/);

  const oversized = validFiles();
  oversized[0] = browserFile(
    "formation.json",
    new TextEncoder().encode("{}"),
    "dowze-formation-test/formation.json",
    2 * 1024 * 1024 + 1
  );
  await assert.rejects(readFormationPackageBrowserFiles(oversized), /limite de 2 Mio/);

  const largeJson = new TextEncoder().encode(JSON.stringify({ padding: "x".repeat(1_400_000) }));
  const oversizedPackage = REQUIRED_FILES.map((name) => browserFile(name, largeJson));
  await assert.rejects(readFormationPackageBrowserFiles(oversizedPackage), /limite totale de 8 Mio/);
});

test("le pont Tauri transmet fuseau, espace UID et archive, tout en respectant les annulations", async () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {}, writable: true });
  const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
  let dialogResult: string | null = null;
  let openDialogResult: string | null = null;

  try {
    mockIPC((command, payload = {}) => {
      calls.push({ command, payload });
      if (command === "plugin:dialog|save") return dialogResult;
      if (command === "plugin:dialog|open") return openDialogResult;
      if (command === "read_formation_package") {
        return {
          directoryName: "dowze-formation-test",
          formation: "{\"file\":\"formation\"}",
          subjects: "{\"file\":\"matieres\"}",
          curriculum: "{\"file\":\"programme\"}",
          schedule: "{\"file\":\"planning\"}",
          assessments: "{\"file\":\"evaluations\"}",
          tasks: "{\"file\":\"taches\"}"
        };
      }
      if (command === "open_calendar_in_apple") return "/tmp/Lycee-Seconde.ics";
      if (command === "save_calendar_ics") return payload.destinationPath;
      if (command === "save_formation_kit") return payload.destinationPath;
      throw new Error(`Commande inattendue : ${command}`);
    });

    assert.equal(await pickFormationPackage("compte-1"), null);
    assert.equal(calls.filter(({ command }) => command === "read_formation_package").length, 0);

    openDialogResult = "/tmp/dowze-formation-test";
    const imported = await pickFormationPackage("compte-1");
    assert.equal(imported?.directoryName, "dowze-formation-test");
    assert.equal(imported?.["programme.json"], "{\"file\":\"programme\"}");
    assert.deepEqual(calls.at(-1), {
      command: "read_formation_package",
      payload: {
        accountId: "compte-1",
        directoryPath: "/tmp/dowze-formation-test"
      }
    });

    const calendar = {
      events: [{
        id: "cours-1",
        title: "Cours",
        start: "2026-09-07T06:30:00.000Z",
        end: "2026-09-07T07:30:00.000Z",
        allDay: false,
        category: "Cours"
      }],
      content: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
      calendarName: "Lycée Seconde",
      filename: "Lycee-Seconde.ics",
      timeZone: "Asia/Tokyo",
      uidNamespace: "formation-a"
    };

    assert.equal(await openCalendarInSystem(calendar), "/tmp/Lycee-Seconde.ics");
    assert.deepEqual(calls.at(-1), {
      command: "open_calendar_in_apple",
      payload: {
        events: calendar.events,
        calendarName: "Lycée Seconde",
        filename: "Lycee-Seconde.ics",
        timeZone: "Asia/Tokyo",
        uidNamespace: "formation-a"
      }
    });

    const legacyCalendar = {
      events: calendar.events,
      content: calendar.content,
      calendarName: "Dowze Academie — Année 1",
      filename: "Dowze-Academie-Planning-2026-2027.ics"
    };
    await openCalendarInSystem(legacyCalendar);
    assert.deepEqual(calls.at(-1), {
      command: "open_calendar_in_apple",
      payload: {
        events: legacyCalendar.events,
        calendarName: "Dowze Academie — Année 1",
        filename: "Dowze-Academie-Planning-2026-2027.ics",
        timeZone: "Europe/Zurich",
        uidNamespace: null
      }
    });

    assert.equal(await saveCalendarIcs(calendar), null);
    assert.equal(calls.filter(({ command }) => command === "save_calendar_ics").length, 0);

    dialogResult = "/tmp/Lycee-Seconde";
    assert.equal(await saveCalendarIcs(calendar), "/tmp/Lycee-Seconde.ics");
    assert.deepEqual(calls.at(-1), {
      command: "save_calendar_ics",
      payload: {
        events: calendar.events,
        calendarName: "Lycée Seconde",
        destinationPath: "/tmp/Lycee-Seconde.ics",
        timeZone: "Asia/Tokyo",
        uidNamespace: "formation-a"
      }
    });

    dialogResult = null;
    await assert.rejects(
      saveFormationKitArchive("compte-1", new Uint8Array([1, 2, 3, 4]), "kit"),
      /signature ZIP/
    );
    await assert.rejects(
      saveFormationKitArchive("compte-1", new Uint8Array(8 * 1024 * 1024 + 1), "kit"),
      /limite de 8 Mio/
    );
    assert.equal(await saveFormationKitArchive("compte-1", new Uint8Array([80, 75, 3, 4]), "kit"), null);
    assert.equal(calls.filter(({ command }) => command === "save_formation_kit").length, 0);

    dialogResult = "/tmp/kit";
    assert.equal(
      await saveFormationKitArchive("compte-1", new Uint8Array([80, 75, 3, 4]), "kit"),
      "/tmp/kit.zip"
    );
    assert.deepEqual(calls.at(-1), {
      command: "save_formation_kit",
      payload: {
        accountId: "compte-1",
        archiveBytes: [80, 75, 3, 4],
        destinationPath: "/tmp/kit.zip"
      }
    });
  } finally {
    clearMocks();
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
        writable: true
      });
    }
  }
});
