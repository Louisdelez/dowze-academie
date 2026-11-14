import assert from 'node:assert/strict';
import { maxAiPanelWidth, MIN_MAIN_WORKSPACE_WIDTH } from '../src/lib/layout.ts';
const viewport = 1430;
assert.ok(viewport - 184 - maxAiPanelWidth(viewport, 800) >= MIN_MAIN_WORKSPACE_WIDTH, 'Expanded navigation must leave enough width to read/edit the workspace');
assert.ok(maxAiPanelWidth(viewport, 600) > maxAiPanelWidth(viewport, 800), 'Compact navigation gives the panel back its space');
assert.ok(maxAiPanelWidth(3000, 800) <= 680, 'Panel should not swallow a large screen');
