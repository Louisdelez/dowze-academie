export const MIN_AI_PANEL_WIDTH = 360;
export const MAX_AI_PANEL_WIDTH = 680;
export const APP_RAIL_WIDTH = 76;
export const MIN_MAIN_WORKSPACE_WIDTH = 680;

export function maxAiPanelWidth(viewportWidth: number) {
  return Math.max(
    MIN_AI_PANEL_WIDTH,
    Math.min(MAX_AI_PANEL_WIDTH, viewportWidth - APP_RAIL_WIDTH - MIN_MAIN_WORKSPACE_WIDTH)
  );
}

export function clampAiPanelWidth(width: number, viewportWidth: number) {
  return Math.min(
    Math.max(Math.round(width), MIN_AI_PANEL_WIDTH),
    maxAiPanelWidth(viewportWidth)
  );
}
