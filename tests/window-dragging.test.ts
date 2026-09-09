import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const capability = JSON.parse(readFileSync("src-tauri/capabilities/main-local.json", "utf8"));
const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");
const workspaceTabs = readFileSync("src/components/WorkspaceTabs.tsx", "utf8");
const aiPanel = readFileSync("src/components/AiPanel.tsx", "utf8");

test("la fenêtre Tauri autorise et expose ses régions de déplacement", () => {
  assert.ok(capability.permissions.includes("core:window:allow-start-dragging"));
  assert.match(sidebar, /className="rail-drag" data-tauri-drag-region/);
  assert.match(workspaceTabs, /className="workspace-tabs-shell" data-tauri-drag-region/);
  assert.match(workspaceTabs, /className="workspace-window-drag" data-tauri-drag-region/);
  assert.match(aiPanel, /className="ai-toolbar" data-tauri-drag-region/);
});
