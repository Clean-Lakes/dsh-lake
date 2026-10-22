export function createUIState() {
  let state = { terminal: null, picker: null, form: null, manage: null, notice: null, revision: 0, expandedResourceFolders: {} };
  const listeners = new Set();
  return {
    getSnapshot: () => state,
    subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback); },
    set(patch) { state = { ...state, ...patch }; for (const listener of listeners) listener(); },
    refresh() { this.set({ revision: state.revision + 1 }); },
  };
}
export function currentWorkspace(workspaces, sessions, sessionId) {
  return workspaces.find(item => item.sessionIds.includes(sessionId))
    || workspaces.find(item => item.path === sessions.byId[sessionId]?.cwd)
    || sessions.ids.map(id => workspaces.find(item => item.sessionIds.includes(id))).find(Boolean)
    || workspaces[0];
}

export function workspaceLabel(workspace) { return workspace?.title === "default-workspace" ? "默认工作区" : workspace?.title || "工作区"; }
