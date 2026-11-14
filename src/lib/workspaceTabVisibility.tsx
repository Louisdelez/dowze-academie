import { createContext, useContext } from "react";
export const WorkspaceTabVisibility = createContext(true);
export const useWorkspaceTabVisible = () => useContext(WorkspaceTabVisibility);
