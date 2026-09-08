import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  bootstrapAuthenticatedPage,
  loginThroughUi,
  logoutThroughUi,
  registerThroughUi
} from "./browser-auth-helpers.mjs";

const baseUrl = process.env.ETUDE_TEST_URL ?? "http://127.0.0.1:1420";
const accountA = {
  displayName: "Profil Alpha",
  username: "profil.alpha",
  password: "Profil-Alpha-2026!"
};
const accountB = {
  displayName: "Profil Bêta",
  username: "profil.beta",
  password: "Profil-Beta-2026!"
};
const markerA = "Tâche privée du profil Alpha";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();

async function profileSummary(storage) {
  return page.evaluate(async (storageKeys) => {
    const { defaultEvents, defaultSubjects, defaultTasks } = await import("/src/data/seed.ts");
    const parse = (key, fallback) => JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback));
    const subjects = parse(storageKeys.subjects, defaultSubjects);
    const tasks = parse(storageKeys.tasks, defaultTasks);
    const events = parse(storageKeys.events, defaultEvents);
    const conversations = parse(storageKeys.conversations, []);
    const lessons = subjects.flatMap((subject) => subject.modules ?? [])
      .flatMap((courseModule) => courseModule.items ?? [])
      .flatMap((item) => item.lessons ?? []);
    return {
      lessonCount: lessons.length,
      completedLessons: lessons.filter((lesson) => lesson.completed).length,
      taskCount: tasks.length,
      completedTasks: tasks.filter((task) => task.completed).length,
      eventCount: events.length,
      academicScheduleRevision: parse(storageKeys.academicScheduleRevision, 0),
      markerPresent: tasks.some((task) => task.title === "Tâche privée du profil Alpha"),
      conversations: conversations.length
    };
  }, storage);
}

async function seedPrivateData(storage) {
  await page.evaluate(async ({ storageKeys, marker }) => {
    const { defaultEvents, defaultSubjects, defaultTasks } = await import("/src/data/seed.ts");
    const subjects = structuredClone(defaultSubjects);
    const firstLesson = subjects.flatMap((subject) => subject.modules)
      .flatMap((courseModule) => courseModule.items)
      .flatMap((item) => item.lessons ?? [])[0];
    firstLesson.completed = true;
    localStorage.setItem(storageKeys.subjects, JSON.stringify(subjects));
    localStorage.setItem(storageKeys.events, JSON.stringify(defaultEvents));
    localStorage.setItem(storageKeys.tasks, JSON.stringify([
      ...defaultTasks,
      {
        id: "private-alpha-task",
        title: marker,
        dueAt: "2026-09-08T08:00:00.000Z",
        completed: false,
        priority: "medium"
      }
    ]));
    localStorage.setItem(storageKeys.conversations, JSON.stringify([{
      id: "private-alpha-conversation",
      subjectId: "analyse",
      provider: "chatgpt",
      url: "https://chatgpt.com/c/profile-isolation-test",
      createdAt: "2026-09-07T08:00:00.000Z",
      name: marker
    }]));
  }, { storageKeys: storage, marker: markerA });
  await page.reload();
}

function assertFresh(summary) {
  assert.equal(summary.lessonCount, 1348);
  assert.equal(summary.completedLessons, 0);
  assert.equal(summary.taskCount, 4);
  assert.equal(summary.completedTasks, 0);
  assert.equal(summary.eventCount, 1115);
  assert.equal(summary.academicScheduleRevision, 2);
  assert.equal(summary.markerPresent, false);
  assert.equal(summary.conversations, 0);
}

try {
  const profileA = await bootstrapAuthenticatedPage(page, baseUrl, accountA);
  assertFresh(await profileSummary(profileA.storage));

  await page.getByLabel("Réglages", { exact: true }).click();
  assert.equal(await page.getByText("Réinitialiser ce compte", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Tout réinitialiser", exact: true }).count(), 0);

  await seedPrivateData(profileA.storage);
  await page.getByLabel("À faire", { exact: true }).click();
  await page.getByText(markerA, { exact: true }).waitFor();

  await logoutThroughUi(page);
  const profileB = await registerThroughUi(page, accountB);
  assert.notEqual(profileA.account.id, profileB.account.id);
  assert.notEqual(profileA.storage.tasks, profileB.storage.tasks);
  assertFresh(await profileSummary(profileB.storage));

  await logoutThroughUi(page);
  await loginThroughUi(page, accountA);
  const alphaRestored = await profileSummary(profileA.storage);
  assert.equal(alphaRestored.completedLessons, 1);
  assert.equal(alphaRestored.markerPresent, true);
  assert.equal(alphaRestored.conversations, 1);

  await logoutThroughUi(page);
  await loginThroughUi(page, accountB);
  assertFresh(await profileSummary(profileB.storage));

  process.stdout.write(
    "Register toujours vierge, profils A/B isolés et aucune fonction de reprise ou reset exposée.\n"
  );
} finally {
  await browser.close();
}
