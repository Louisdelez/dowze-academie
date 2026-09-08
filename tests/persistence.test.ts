import assert from "node:assert/strict";
import test from "node:test";
import { hasCompatiblePersistentShape } from "../src/hooks/usePersistentState.ts";

test("refuse null pour les collections et les objets persistés", () => {
  assert.equal(hasCompatiblePersistentShape(null, []), false);
  assert.equal(hasCompatiblePersistentShape(null, { value: 1 }), false);
});

test("accepte uniquement la forme racine attendue", () => {
  assert.equal(hasCompatiblePersistentShape([], []), true);
  assert.equal(hasCompatiblePersistentShape({}, []), false);
  assert.equal(hasCompatiblePersistentShape({}, { value: 1 }), true);
  assert.equal(hasCompatiblePersistentShape([], { value: 1 }), false);
  assert.equal(hasCompatiblePersistentShape(true, false), true);
  assert.equal(hasCompatiblePersistentShape("true", false), false);
  assert.equal(hasCompatiblePersistentShape(440, 440), true);
  assert.equal(hasCompatiblePersistentShape("440", 440), false);
});

test("les identifiants optionnels persistent comme chaîne ou null", () => {
  assert.equal(hasCompatiblePersistentShape(null, null), true);
  assert.equal(hasCompatiblePersistentShape("subject-1", null), true);
  assert.equal(hasCompatiblePersistentShape(12, null), false);
});
