import { useEffect, useState, type ReactNode } from "react";
import { WorkspaceTabVisibility } from "../lib/workspaceTabVisibility";
/** Mount on first visit, retain editor/history/scroll until this tab is closed. */
export function PersistentWorkspacePanel({ id, labelledBy, active, children,splitSlot }: { splitSlot?:'primary'|'secondary';id: string; labelledBy: string; active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active);
  useEffect(() => { if (active) setVisited(true); }, [active]);
  return <div className="workspace-tab-panel" data-split-slot={splitSlot} id={id} role="tabpanel" aria-labelledby={labelledBy} hidden={!active} inert={!active}>
    <WorkspaceTabVisibility.Provider value={active}>{active || visited ? children : null}</WorkspaceTabVisibility.Provider>
  </div>;
}
