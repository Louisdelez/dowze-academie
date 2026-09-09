import assert from "node:assert/strict";
import test from "node:test";
import {
  FORMATION_REGISTRY_STORAGE,
  formationRegistryStorageFor,
  formationStorageFor,
  profileStoragePrefix,
  WORKSPACE_STORAGE
} from "../src/lib/profileStorage.ts";

const accountA = "21f81232-3f1b-4f01-8d2e-873017145bb8";
const accountB = "49f32926-92fd-4263-a71a-020404b6fc5a";
const formationA = "9f8e7967-d9da-4f60-97da-19b31cedfd2f";
const formationB = "b030f24d-cf20-43f8-980e-9d740ee86562";

const FORMATION_RECORD_SUFFIXES = {
  subjects: "subjects.v2",
  events: "events.v2",
  tasks: "tasks.v2",
  conversations: "conversations.v2",
  assessments: "assessments.v1",
  provider: "ai-provider.v1",
  aiVisible: "ai-visible.v1",
  aiWidth: "ai-width.v1",
  selectedSubject: "selected-subject.v2",
  calendarView: "calendar-view.v1",
  academicScheduleRevision: "academic-schedule-revision.v1",
  subjectNotes: "subject-notes.v1",
  freeChatConversations: "free-chat.conversations.v1",
  freeChatActiveConversation: "free-chat.active.v1",
  freeChatConfig: "free-chat.config.v1",
  freeChatBackend: "free-chat.backend.v1",
  notesHistoryOpen: "notes-history-open",
  notesCoursesSidebarOpen: "notes-courses-sidebar-open",
  resetJournal: "reset-journal.v2"
} as const satisfies Record<keyof typeof WORKSPACE_STORAGE, string>;

test("la formation historique reste un alias exact des 19 clés existantes", () => {
  const current = formationStorageFor(accountA, {
    instanceId: "engineering-energy-year1-2026-2027",
    storageKind: "legacy-energy-year1"
  });
  const expected = Object.fromEntries(
    Object.entries(WORKSPACE_STORAGE).map(([name, key]) => [
      name,
      `${profileStoragePrefix(accountA)}${key.slice("etude.".length)}`
    ])
  );

  assert.equal(Object.keys(current).length, 19);
  assert.equal(Object.keys(WORKSPACE_STORAGE).length, 19);
  assert.deepEqual(current, expected);
  assert.equal(JSON.stringify(current), JSON.stringify(expected));
});

test("les nouvelles formations gardent les versions et retirent energy-year1 des 19 suffixes", () => {
  const keys = formationStorageFor(accountA, {
    instanceId: formationA,
    storageKind: "formation-v1"
  });
  const prefix = `${profileStoragePrefix(accountA)}formations.data.v1.${formationA}.`;

  assert.equal(Object.keys(keys).length, 19);
  assert.equal(new Set(Object.values(keys)).size, 19);
  for (const name of Object.keys(WORKSPACE_STORAGE) as Array<keyof typeof WORKSPACE_STORAGE>) {
    assert.equal(keys[name], `${prefix}${FORMATION_RECORD_SUFFIXES[name]}`, name);
    assert.equal(keys[name].includes("energy-year1"), false, name);
  }
});

test("isole chaque combinaison de compte et d’instance de formation", () => {
  const spaces = [
    formationStorageFor(accountA, { instanceId: formationA, storageKind: "formation-v1" }),
    formationStorageFor(accountA, { instanceId: formationB, storageKind: "formation-v1" }),
    formationStorageFor(accountB, { instanceId: formationA, storageKind: "formation-v1" })
  ].map((space) => Object.values(space));

  for (let left = 0; left < spaces.length; left += 1) {
    for (let right = left + 1; right < spaces.length; right += 1) {
      assert.equal(spaces[left].some((key) => spaces[right].includes(key)), false);
    }
  }
});

test("refuse les identifiants d’instance qui ne sont pas des UUIDv4 canoniques", () => {
  for (const instanceId of [
    "",
    "../formation",
    "9f8e7967-d9da-1f60-97da-19b31cedfd2f",
    "9f8e7967-d9da-4f60-77da-19b31cedfd2f",
    "9f8e7967d9da4f6097da19b31cedfd2f",
    "9F8E7967-D9DA-4F60-97DA-19B31CEDFD2F"
  ]) {
    assert.throws(
      () => formationStorageFor(accountA, { instanceId, storageKind: "formation-v1" }),
      /Identifiant d’instance de formation invalide/,
      instanceId
    );
  }
});

test("produit les trois clés de registre dans le profil demandé", () => {
  assert.deepEqual(FORMATION_REGISTRY_STORAGE, {
    registry: "formations.registry.v1",
    active: "formations.active.v1",
    installJournal: "formations.install-journal.v1"
  });
  assert.deepEqual(formationRegistryStorageFor(accountA), {
    registry: `${profileStoragePrefix(accountA)}formations.registry.v1`,
    active: `${profileStoragePrefix(accountA)}formations.active.v1`,
    installJournal: `${profileStoragePrefix(accountA)}formations.install-journal.v1`
  });
  assert.ok(
    Object.values(formationRegistryStorageFor(accountA))
      .every((key) => !Object.values(formationRegistryStorageFor(accountB)).includes(key))
  );
  assert.throws(
    () => formationRegistryStorageFor("../autre-compte"),
    /Identifiant de compte local invalide/
  );
});
