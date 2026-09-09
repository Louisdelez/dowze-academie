import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const moduleHooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && !specifier.endsWith(".ts")) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  }
});

const formations = await import("../src/lib/formations.ts");
const { buildCalendarIcs } = await import("../src/lib/calendarIcs.ts");
const { buildFormationTemplateFiles } = await import("../src/lib/formationPrompts.ts");
const { dateKeyAtTimeZone } = await import("../src/lib/zonedDate.ts");
moduleHooks.deregister();

function templateFiles(name = "Lycée seconde") {
  return buildFormationTemplateFiles({
    name,
    startDate: "2026-09-01",
    endDate: "2027-06-30"
  });
}

function replaceJson(
  files: ReturnType<typeof templateFiles>,
  filename: keyof ReturnType<typeof templateFiles>,
  mutate: (value: Record<string, unknown>) => void
) {
  const value = JSON.parse(files[filename]) as Record<string, unknown>;
  mutate(value);
  return { ...files, [filename]: JSON.stringify(value) };
}

test("expose les six noms canoniques dans un ordre déterministe", () => {
  assert.deepEqual(formations.FORMATION_PACKAGE_FILENAMES, [
    "formation.json",
    "matieres.json",
    "programme.json",
    "planning.json",
    "evaluations.json",
    "taches.json"
  ]);
  assert.equal(formations.FORMATION_PACKAGE_FILENAMES, formations.FORMATION_REQUIRED_FILES);
});

test("compile le modèle minimal de façon déterministe et remet toute progression à zéro", () => {
  const files = templateFiles();
  const first = formations.validateAndCompileFormationPackage(files);
  const second = formations.validateAndCompileFormationPackage(files);

  assert.deepEqual(first, second);
  assert.equal(first.valid, true, JSON.stringify(first.issues));
  assert.ok(first.manifest);
  assert.deepEqual(first.counts, {
    subjects: 1,
    modules: 1,
    chapters: 1,
    lessons: 1,
    events: 44,
    tasks: 1
  });
  assert.deepEqual(first.compiled, {
    subjects: first.subjects,
    events: first.events,
    tasks: first.tasks
  });
  assert.ok(first.subjects.every((subject) =>
    subject.modules.every((module) =>
      module.items.every((item) =>
        !item.completed && item.lessons?.every((lesson) => !lesson.completed)
      )
    )
  ));
  assert.ok(first.tasks.every((task) => !task.completed && task.completedAt === undefined));
  assert.equal(first.events[0].start, "2026-09-07T07:00:00.000Z");
  assert.deepEqual(
    first.events.find((event) => event.id === "evaluation-fondations")?.assessment,
    {
      eventId: "evaluation-fondations",
      kind: "evaluation",
      title: "Évaluation des fondations",
      scheduledAt: "2026-10-12T07:00:00.000Z",
      durationMinutes: 60,
      chapterIds: ["chapitre-introduction"],
      allowedMaterials: "Aucun matériel"
    }
  );
});

test("refuse récursivement les champs inconnus", () => {
  const files = replaceJson(templateFiles(), "formation.json", (manifest) => {
    manifest.instructionCache = "non autorisé";
  });
  const preview = formations.validateAndCompileFormationPackage(files);
  assert.equal(preview.valid, false);
  assert.equal(preview.compiled, undefined);
  assert.ok(preview.issues.some((issue) =>
    issue.file === "formation.json" && issue.path === "$.instructionCache" && issue.code === "unknown-field"
  ));
});

test("plafonne les erreurs détaillées d’un objet hostile", () => {
  const files = replaceJson(templateFiles(), "formation.json", (manifest) => {
    for (let index = 0; index < 20_000; index += 1) {
      manifest[`champ-inconnu-${index}`] = true;
    }
  });
  const preview = formations.validateAndCompileFormationPackage(files);
  assert.equal(preview.valid, false);
  assert.equal(
    preview.issues.length,
    formations.FORMATION_IMPORT_MAX_REPORTED_ISSUES + 1
  );
  assert.equal(preview.issues.at(-1)?.code, "too-many-errors");
});

test("refuse les substituts UTF-16 isolés comme le lecteur JSON natif", () => {
  const files = replaceJson(templateFiles(), "formation.json", (manifest) => {
    manifest.name = "Formation \ud800 invalide";
  });
  const preview = formations.validateAndCompileFormationPackage(files);
  assert.equal(preview.valid, false);
  assert.ok(preview.issues.some((issue) =>
    issue.file === "formation.json" && issue.path === "$.name" && issue.code === "invalid-unicode"
  ));
});

test("refuse les contrôles Unicode qui rendraient un futur événement inexploitable", () => {
  const files = replaceJson(templateFiles(), "matieres.json", (root) => {
    const subjects = root.subjects as Array<Record<string, unknown>>;
    subjects[0].name = "Méde\u0000cine";
  });
  const preview = formations.validateAndCompileFormationPackage(files);
  assert.equal(preview.valid, false);
  assert.ok(preview.issues.some((issue) =>
    issue.file === "matieres.json" &&
    issue.path === "$.subjects[0].name" &&
    issue.code === "invalid-control-character"
  ));
});

test("refuse une référence de chapitre orpheline", () => {
  const files = replaceJson(templateFiles(), "evaluations.json", (root) => {
    const assessments = root.assessments as Array<Record<string, unknown>>;
    assessments[0].chapterIds = ["chapitre-introuvable"];
  });
  const preview = formations.validateAndCompileFormationPackage(files);
  assert.equal(preview.valid, false);
  assert.ok(preview.issues.some((issue) =>
    issue.file === "evaluations.json" && issue.code === "unknown-reference"
  ));
});

test("refuse une évaluation hors de la plage générable ou sans chapitre", () => {
  for (const durationMinutes of [5, 500]) {
    const files = replaceJson(templateFiles(), "evaluations.json", (root) => {
      const assessments = root.assessments as Array<Record<string, unknown>>;
      assessments[0].durationMinutes = durationMinutes;
    });
    const preview = formations.validateAndCompileFormationPackage(files);
    assert.equal(preview.valid, false);
    assert.ok(preview.issues.some((issue) =>
      issue.file === "evaluations.json" &&
      issue.path === "$.assessments[0].durationMinutes" &&
      issue.code === "invalid-value"
    ));
  }

  const withoutChapter = replaceJson(templateFiles(), "evaluations.json", (root) => {
    const assessments = root.assessments as Array<Record<string, unknown>>;
    assessments[0].chapterIds = [];
  });
  const preview = formations.validateAndCompileFormationPackage(withoutChapter);
  assert.equal(preview.valid, false);
  assert.ok(preview.issues.some((issue) =>
    issue.file === "evaluations.json" &&
    issue.path === "$.assessments[0].chapterIds" &&
    issue.code === "invalid-value"
  ));
});

test("refuse un chapitre dont le prompt IA dépasserait la limite native", () => {
  const files = replaceJson(templateFiles(), "programme.json", (root) => {
    const programs = root.programs as Array<Record<string, unknown>>;
    const modules = programs[0].modules as Array<Record<string, unknown>>;
    const items = modules[0].items as Array<Record<string, unknown>>;
    items[0].lessons = Array.from({ length: 40 }, (_, index) => ({
      id: `cours-volumineux-${index + 1}`,
      title: `Cours volumineux ${index + 1}`,
      objective: `${index + 1} — ${"objectif détaillé ".repeat(110)}`.slice(0, 2_000)
    }));
  });
  const preview = formations.validateAndCompileFormationPackage(files);
  assert.equal(preview.valid, false);
  assert.ok(preview.issues.some((issue) =>
    issue.file === "programme.json" && issue.code === "ai-prompt-too-large"
  ));
});

test("refuse un horaire hebdomadaire inexistant lors du passage DST", () => {
  const files = replaceJson(templateFiles(), "planning.json", (root) => {
    const periods = root.periods as Array<Record<string, unknown>>;
    periods[0].startDate = "2027-03-28";
    periods[0].endDate = "2027-03-28";
    const slots = root.weeklySlots as Array<Record<string, unknown>>;
    slots[0].weekdays = [7];
    slots[0].startTime = "02:30";
  });
  const preview = formations.validateAndCompileFormationPackage(files);
  assert.equal(preview.valid, false);
  assert.ok(preview.issues.some((issue) =>
    issue.file === "planning.json" && issue.code === "nonexistent-local-time"
  ));
});

test("préserve les dates civiles et ICS des fermetures lors d’un saut à minuit", () => {
  for (const [dateKey, nextDateKey, timeZone, icsDate, icsNextDate] of [
    ["2027-03-28", "2027-03-29", "Asia/Beirut", "20270328", "20270329"],
    ["2027-04-30", "2027-05-01", "Africa/Cairo", "20270430", "20270501"]
  ] as const) {
    let files = replaceJson(templateFiles(), "formation.json", (manifest) => {
      manifest.timeZone = timeZone;
    });
    files = replaceJson(files, "planning.json", (root) => {
      root.closures = [{
        id: "fermeture-dst",
        title: "Fermeture DST",
        startDate: dateKey,
        endDate: dateKey
      }];
    });

    const preview = formations.validateAndCompileFormationPackage(files);
    assert.equal(preview.valid, true, `${timeZone}: ${JSON.stringify(preview.issues)}`);
    const closure = preview.events.find((event) => event.id === "fermeture-dst");
    assert.ok(closure, timeZone);
    assert.equal(dateKeyAtTimeZone(new Date(closure.start), timeZone), dateKey, timeZone);
    assert.equal(dateKeyAtTimeZone(new Date(closure.end), timeZone), nextDateKey, timeZone);

    const ics = buildCalendarIcs(preview.events, preview.subjects, {
      generatedAt: new Date("2026-01-01T00:00:00.000Z"),
      timeZone
    }).content;
    assert.match(ics, new RegExp(`DTSTART;VALUE=DATE:${icsDate}\\r\\n`), timeZone);
    assert.match(ics, new RegExp(`DTEND;VALUE=DATE:${icsNextDate}\\r\\n`), timeZone);
  }
});

test("refuse proprement une fermeture sur une date civile entièrement sautée", () => {
  let files = replaceJson(templateFiles(), "formation.json", (manifest) => {
    manifest.timeZone = "Pacific/Apia";
    manifest.yearLabel = "Année scolaire 2011";
    manifest.academicYear = { startDate: "2011-01-01", endDate: "2011-12-31" };
  });
  files = replaceJson(files, "planning.json", (root) => {
    const periods = root.periods as Array<Record<string, unknown>>;
    periods[0].startDate = "2011-01-01";
    periods[0].endDate = "2011-12-31";
    root.closures = [{
      id: "jour-saute",
      title: "Jour sauté",
      startDate: "2011-12-30",
      endDate: "2011-12-30"
    }];
  });
  files = replaceJson(files, "evaluations.json", (root) => {
    const assessments = root.assessments as Array<Record<string, unknown>>;
    assessments[0].scheduledAt = "2011-10-12T09:00";
  });
  files = replaceJson(files, "taches.json", (root) => {
    const tasks = root.tasks as Array<Record<string, unknown>>;
    tasks[0].dueAt = "2011-09-01T17:00";
  });

  const preview = formations.validateAndCompileFormationPackage(files);
  assert.equal(preview.valid, false);
  assert.equal(preview.compiled, undefined);
  assert.ok(preview.issues.some((issue) =>
    issue.file === "planning.json" &&
    issue.path === "$.closures[0].startDate" &&
    issue.code === "nonexistent-local-date"
  ));

  const skippedExclusiveEnd = replaceJson(files, "planning.json", (root) => {
    root.closures = [{
      id: "veille-jour-saute",
      title: "Veille du jour sauté",
      startDate: "2011-12-29",
      endDate: "2011-12-29"
    }];
  });
  const endPreview = formations.validateAndCompileFormationPackage(skippedExclusiveEnd);
  assert.equal(endPreview.valid, false);
  assert.ok(endPreview.issues.some((issue) =>
    issue.file === "planning.json" &&
    issue.path === "$.closures[0].endDate" &&
    issue.code === "nonexistent-local-date"
  ));
});

test("refuse une année hors de la plage éditable par l’application", () => {
  const shiftedFiles = Object.fromEntries(
    Object.entries(templateFiles()).map(([filename, content]) => [
      filename,
      content.replaceAll("2026", "2102").replaceAll("2027", "2103")
    ])
  ) as ReturnType<typeof templateFiles>;
  const preview = formations.validateAndCompileFormationPackage(shiftedFiles);
  assert.equal(preview.valid, false);
  assert.ok(preview.issues.some((issue) =>
    issue.file === "formation.json" && issue.code === "unsupported-date-range"
  ));
});

test("refuse un instant UTC antérieur à 1900 produit par le fuseau de la formation", () => {
  let files = replaceJson(templateFiles(), "formation.json", (manifest) => {
    manifest.timeZone = "Asia/Tokyo";
    manifest.academicYear = { startDate: "1900-01-01", endDate: "1900-12-31" };
  });
  files = replaceJson(files, "planning.json", (root) => {
    const periods = root.periods as Array<Record<string, unknown>>;
    periods[0].startDate = "1900-01-01";
    periods[0].endDate = "1900-01-07";
    const slots = root.weeklySlots as Array<Record<string, unknown>>;
    slots[0].weekdays = [1];
    slots[0].startTime = "00:00";
  });
  files = replaceJson(files, "evaluations.json", (root) => {
    const assessments = root.assessments as Array<Record<string, unknown>>;
    assessments[0].scheduledAt = "1900-02-01T09:00";
  });
  files = replaceJson(files, "taches.json", (root) => {
    const tasks = root.tasks as Array<Record<string, unknown>>;
    tasks[0].dueAt = "1900-01-02T17:00";
  });

  const preview = formations.validateAndCompileFormationPackage(files);

  assert.equal(preview.valid, false);
  assert.ok(preview.issues.some((issue) => issue.code === "compiled-date-out-of-range"));
});

test("refuse proprement un nom de calendrier trop long en UTF-8", () => {
  const files = replaceJson(templateFiles(), "formation.json", (manifest) => {
    manifest.shortName = "界".repeat(60);
  });
  const preview = formations.validateAndCompileFormationPackage(files);
  assert.equal(preview.valid, false);
  assert.ok(preview.issues.some((issue) =>
    issue.file === "formation.json" && issue.code === "calendar-field-too-large"
  ));
});

test("refuse les champs Unicode que la commande calendrier native ne pourrait pas exporter", () => {
  for (const [field, value] of [
    ["location", "界".repeat(334)],
    ["description", "界".repeat(3_990)]
  ] as const) {
    const files = replaceJson(templateFiles(), "planning.json", (root) => {
      const slots = root.weeklySlots as Array<Record<string, unknown>>;
      slots[0][field] = value;
    });
    const preview = formations.validateAndCompileFormationPackage(files);
    assert.equal(preview.valid, false, field);
    assert.ok(preview.issues.some((issue) => issue.code === "calendar-field-too-large"), field);
  }
});

test("valide les libellés de matière natifs même lorsque le calendrier initial est vide", () => {
  for (const shortName of [" Matière", "😀".repeat(76)]) {
    let files = replaceJson(templateFiles(), "matieres.json", (root) => {
      const subjects = root.subjects as Array<Record<string, unknown>>;
      subjects[0].shortName = shortName;
    });
    files = replaceJson(files, "planning.json", (root) => {
      root.weeklySlots = [];
      root.events = [];
    });
    files = replaceJson(files, "evaluations.json", (root) => {
      root.assessments = [];
    });
    const preview = formations.validateAndCompileFormationPackage(files);
    assert.equal(preview.valid, false, shortName);
    assert.ok(preview.issues.some((issue) =>
      issue.file === "matieres.json" &&
      issue.path === "$.subjects[0].shortName" &&
      ["calendar-field-invalid", "calendar-field-too-large"].includes(issue.code)
    ));
  }
});

test("compte les limites JSON en points de code comme le schéma Draft 2020-12", () => {
  const files = replaceJson(templateFiles(), "formation.json", (manifest) => {
    manifest.name = "😀".repeat(101);
  });
  const preview = formations.validateAndCompileFormationPackage(files);
  assert.equal(preview.valid, true, JSON.stringify(preview.issues));
});

test("refuse un calendrier qui dépasserait 4 Mio avec le futur UUID d’instance", () => {
  let files = replaceJson(templateFiles(), "formation.json", (manifest) => {
    manifest.id = "a";
  });
  files = replaceJson(files, "planning.json", (root) => {
    const baseSlot = (root.weeklySlots as Array<Record<string, unknown>>)[0];
    root.weeklySlots = Array.from({ length: 21 }, (_, index) => ({
      ...baseSlot,
      id: `creneau-volumineux-${index}`,
      description: "x".repeat(4_000)
    }));
    root.events = Array.from({ length: 10 }, (_, index) => ({
      id: `evenement-volumineux-${index}`,
      title: `Événement volumineux ${index}`,
      startLocal: `2026-09-${String(index + 2).padStart(2, "0")}T12:00`,
      endLocal: `2026-09-${String(index + 2).padStart(2, "0")}T13:00`,
      type: "personal",
      description: "x".repeat(4_000)
    }));
  });

  const preview = formations.validateAndCompileFormationPackage(files);

  assert.equal(preview.valid, false);
  assert.ok(preview.issues.some((issue) => issue.code === "calendar-too-large"));
});

test("applique la limite d’expansion des événements sans état partiel", () => {
  const preview = formations.validateAndCompileFormationPackage(templateFiles(), {
    maxExpandedEvents: 1
  });
  assert.equal(preview.valid, false);
  assert.equal(preview.events.length, 0);
  assert.equal(preview.compiled, undefined);
  assert.ok(preview.issues.some((issue) => issue.code === "event-limit"));
});

test("refuse un paquet dont les six fichiers dépassent ensemble 8 Mio", () => {
  const padding = " ".repeat(1_400_000);
  const files = Object.fromEntries(
    Object.entries(templateFiles()).map(([filename, content]) => [filename, `${content}${padding}`])
  ) as ReturnType<typeof templateFiles>;
  const preview = formations.validateAndCompileFormationPackage(files);
  assert.equal(preview.valid, false);
  assert.equal(preview.compiled, undefined);
  assert.ok(preview.issues.some((issue) => issue.code === "package-too-large"));
});

test("une matière importée nommée anglais reste un cursus standard", () => {
  const files = Object.fromEntries(
    Object.entries(templateFiles("Anglais professionnel")).map(([filename, content]) => [
      filename,
      content.replaceAll('"matiere-principale"', '"anglais"')
    ])
  ) as ReturnType<typeof templateFiles>;
  const preview = formations.validateAndCompileFormationPackage(files);
  assert.equal(preview.valid, true, JSON.stringify(preview.issues));
  assert.equal(preview.subjects[0]?.id, "anglais");
  assert.equal(preview.subjects[0]?.curriculumKind, undefined);
});

test("une matière CECRL importée exige et conserve sa langue explicite", () => {
  let files = replaceJson(templateFiles("Allemand B1"), "matieres.json", (root) => {
    const subject = (root.subjects as Array<Record<string, unknown>>)[0];
    subject.name = "Allemand";
    subject.shortName = "Allemand";
    subject.cefrLevel = "B1";
    subject.languageCode = "de";
    subject.languageName = "allemand";
  });
  files = replaceJson(files, "programme.json", (root) => {
    const program = (root.programs as Array<Record<string, unknown>>)[0];
    const courseModule = (program.modules as Array<Record<string, unknown>>)[0];
    courseModule.cefrLevel = "B1";
  });

  const preview = formations.validateAndCompileFormationPackage(files);
  assert.equal(preview.valid, true, JSON.stringify(preview.issues));
  assert.equal(preview.subjects[0]?.languageCode, "de");
  assert.equal(preview.subjects[0]?.languageName, "allemand");
  assert.equal(preview.subjects[0]?.cefrLevel, "B1");
});

test("refuse tout CECRL sans langue explicite et toute balise BCP 47 non canonique", () => {
  const missingLanguage = replaceJson(templateFiles(), "matieres.json", (root) => {
    (root.subjects as Array<Record<string, unknown>>)[0].cefrLevel = "B1";
  });
  const missingPreview = formations.validateAndCompileFormationPackage(missingLanguage);
  assert.equal(missingPreview.valid, false);
  assert.ok(missingPreview.issues.some((issue) => issue.code === "missing-language-metadata"));

  const nonCanonicalCode = replaceJson(templateFiles(), "matieres.json", (root) => {
    const subject = (root.subjects as Array<Record<string, unknown>>)[0];
    subject.languageCode = "DE";
    subject.languageName = "allemand";
  });
  const codePreview = formations.validateAndCompileFormationPackage(nonCanonicalCode);
  assert.equal(codePreview.valid, false);
  assert.ok(codePreview.issues.some((issue) =>
    issue.path === "$.subjects[0].languageCode" && issue.code === "invalid-locale"
  ));
});

test("valide la convention de dossier lorsqu’elle est fournie", () => {
  const files = templateFiles();
  const id = JSON.parse(files["formation.json"]).id as string;
  assert.equal(
    formations.validateAndCompileFormationPackage({
      ...files,
      directoryName: `dowze-formation-${id}`
    }).valid,
    true
  );
  const invalid = formations.validateAndCompileFormationPackage({
    ...files,
    directoryName: "mon-dossier"
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.some((issue) => issue.code === "invalid-directory-name"));
});

test("décrit la formation historique sans migration destructrice", () => {
  const builtin = formations.BUILTIN_ENERGY_FORMATION;
  assert.equal(builtin.instanceId, "ingenierie-energie-annee-1");
  assert.equal(builtin.storageKind, "legacy-energy-year1");
  assert.equal(builtin.manifest.academicYear.startDate, "2026-09-07");
  assert.equal(builtin.manifest.academicYear.endDate, "2027-07-24");
  assert.equal(formations.formationDisplayYear(builtin), "2026–2027");
  assert.equal(formations.isInstalledFormation(builtin), true);
  assert.equal(formations.isInstalledFormation({ ...builtin, surprise: true }), false);
  assert.equal(
    formations.isInstalledFormation({ ...builtin, storageKind: "formation-v1" }),
    false,
    "Une formation importée doit employer un UUIDv4 pour isoler son stockage."
  );
});
