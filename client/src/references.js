import { api } from './api.js';
import { workspaceLabel } from './state.js';

export const resourceSourceName = 'lake-resource';
export const resourceTextRule = {
  id: resourceSourceName, order: 15,
  match(text, from) {
    const marker = '[Lake resource]\n';
    let header = text.indexOf(marker, from);
    while (header >= 0) {
      // DSH trims persisted messages, so a leading reference loses its newline.
      // A previous match may also have consumed the newline before this header.
      if (header > 0 && text[header - 1] !== '\n') {
        header = text.indexOf(marker, header + marker.length);
        continue;
      }
      const start = header > from && text[header - 1] === '\n' ? header - 1 : header;
      const jsonStart = header + marker.length, nextLine = text.indexOf('\n', jsonStart);
      const lineEnd = nextLine < 0 ? text.length : nextLine;
      try {
        if (lineEnd - jsonStart > 4096) throw new Error();
        const value = JSON.parse(text.slice(jsonStart, lineEnd));
        decode(value.workspaceId + '/' + value.resourceId);
        if (typeof value.name !== 'string' || typeof value.kind !== 'string') throw new Error();
        return { id: resourceSourceName, start, end: lineEnd + (nextLine < 0 ? 0 : 1), data: { workspaceId: value.workspaceId, resourceId: value.resourceId, name: value.name, kind: value.kind, ...(typeof value.host === 'string' ? { host: value.host } : {}) } };
      } catch {}
      header = text.indexOf(marker, lineEnd + 1);
    }
    return undefined;
  },
};
function decode(ref) {
  const parts = ref.split('/');
  if (parts.length !== 2 || parts.some(value => !/^[\w-]{1,160}$/.test(value))) throw new Error('资源引用无效，请重新选择');
  return { workspaceId: parts[0], resourceId: parts[1] };
}
export function resourceReference(resource, workspaceId) {
  const ref = workspaceId + '/' + resource.id; decode(ref);
  return { source: resourceSourceName, ref, label: resource.name, clipboardText: `@lake-resource(${ref})` };
}
export function resourceSource(ctx, openPreview, request = api) {
  const cached = new Map();
  return {
    trigger: '@', name: resourceSourceName, order: -10, showGroupTitle: false,
    async candidates(session, { query, signal }) {
      const workspaces = ctx.workspaces.list.getSnapshot().items, sessions = ctx.sessions.list.getSnapshot();
      const workspace = workspaces.find(item => item.sessionIds.includes(session.sessionId)) || workspaces.find(item => item.path === sessions.byId[session.sessionId]?.cwd);
      if (!workspace) return [];
      const data = await request(`/workspaces/${workspace.workspaceId}/resources`, 'GET', undefined, signal);
      const needle = query.toLowerCase();
      return data.resources.filter(resource => (resource.name + ' ' + (resource.ssh?.host || '')).toLowerCase().includes(needle)).map(resource => {
        const reference = resourceReference(resource, workspace.workspaceId); cached.set(reference.ref, reference);
        return { name: resource.name, label: resource.name, value: reference.ref, description: resource.ssh?.host || (resource.kind === 'local' ? '本机终端' : resource.kind), section: '工作区资源 · ' + workspaceLabel(workspace) };
      });
    },
    onPick({ candidate }) {
      const reference = cached.get(candidate.value);
      if (!reference) return undefined;
      return { insert: reference };
    },
    openReference(_session, reference) { decode(reference.ref); openPreview(reference.ref); return true; },
    codec: {
      clipboardText(ref) { decode(ref); return `@lake-resource(${ref})`; },
      async serialize(ref, signal) {
        const { workspaceId, resourceId } = decode(ref);
        const data = await request(`/workspaces/${workspaceId}/resources`, 'GET', undefined, signal);
        const resource = data.resources.find(item => item.id === resourceId);
        if (!resource) throw new Error('引用的资源已移除或关联已变化，请重新选择资源');
        // Resolve fresh, credential-free metadata at send time. Never silently
        // turn an unavailable reference into a different resource or plain text.
        return '\n[Lake resource]\n' + JSON.stringify({ workspaceId, resourceId, name: resource.name, kind: resource.kind, ...(resource.ssh?.host ? { host: resource.ssh.host } : {}) }) + '\n';
      },
    },
  };
}
