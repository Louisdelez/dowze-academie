import assert from "node:assert/strict";
import test from "node:test";
import { clampAiPanelWidth, maxAiPanelWidth } from "../src/lib/layout.ts";

test("réserve 680 px au contenu central dans la fenêtre minimale", () => {
  assert.equal(maxAiPanelWidth(1120), 364);
  assert.equal(clampAiPanelWidth(680, 1120), 364);
});

test("conserve la largeur maximale sur un grand écran", () => {
  assert.equal(maxAiPanelWidth(1600), 680);
  assert.equal(clampAiPanelWidth(520, 1600), 520);
});
