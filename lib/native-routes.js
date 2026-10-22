import { LakeError, identifier } from './backend.js';
import { sendJSON } from './proxy.js';

async function body(request, limit = 131072) {
  if (String(request.headers['content-type']).split(';')[0].trim() !== 'application/json') throw new LakeError('Content-Type must be application/json', 415);
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > limit) throw new LakeError('Request too large', 413); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; } catch { throw new LakeError('Invalid JSON object'); }
}
export async function nativeRoute(backend, request, response) {
  const url = new URL(request.url, 'http://localhost');
  const path = url.pathname.slice('/lake/api'.length);
  if (path === '/catalog' && request.method === 'GET') { sendJSON(response, 200, await backend.catalog()); return; }
  const workspace = path.match(/^\/workspaces\/([\w-]+)\/resources$/);
  if (workspace && request.method === 'GET') { sendJSON(response, 200, await backend.workspace(workspace[1])); return; }
  if (workspace && request.method === 'POST') { sendJSON(response, 200, await backend.bindWorkspace(workspace[1], await body(request))); return; }
  const tree = path.match(/^\/workspaces\/([\w-]+)\/resource-tree$/);
  if (tree && request.method === 'POST') { sendJSON(response, 200, await backend.editWorkspaceTree(tree[1], await body(request))); return; }
  const item = path.match(/^\/workspaces\/([\w-]+)\/resource-items(?:\/([\w-]+))?$/);
  if (item) {
    if (!item[2] && request.method === 'POST') { sendJSON(response, 201, await backend.createWorkspaceResource(item[1], await body(request, 2 << 20))); return; }
    if (item[2] && request.method === 'GET') { sendJSON(response, 200, await backend.workspaceResource(item[1], item[2])); return; }
    if (item[2] && request.method === 'PATCH') { sendJSON(response, 200, await backend.editWorkspaceResource(item[1], item[2], await body(request, 2 << 20))); return; }
    if (item[2] && request.method === 'DELETE') { sendJSON(response, 200, await backend.deleteWorkspaceResource(item[1], item[2])); return; }
    throw new LakeError('Method not allowed', 405);
  }
  const match = path.match(/^\/projects\/([\w-]+)\/resources$/);
  if (request.method === 'POST' && (path === '/projects' || match)) {
    const data = await body(request);
    if (match && data.kind !== 'ssh') throw new LakeError('当前支持添加 SSH 资源');
    sendJSON(response, 201, await backend.call(path, 'POST', data)); return;
  }
  if (path === '/terminals/open' && request.method === 'POST') {
    const data = await body(request);
    const controller = new AbortController();
    const abort = () => controller.abort();
    response.once('close', abort);
    try { sendJSON(response, 201, await backend.terminal(data.dshSessionId, data.resourceId, true, controller.signal)); }
    finally { response.removeListener('close', abort); }
    return;
  }
  if (path === '/trust' && request.method === 'GET') { sendJSON(response, 200, await backend.trust(url.searchParams.get('dshSessionId'))); return; }
  if (path === '/trust' && request.method === 'POST') {
    const { dshSessionId, projectId, id, accept, fingerprint } = await body(request);
    if (typeof accept !== 'boolean') throw new LakeError('accept must be boolean');
    sendJSON(response, 200, await backend.trust(dshSessionId, projectId, { id: identifier(id), accept, fingerprint })); return;
  }
  const terminal = path.match(/^\/terminals\/([\w-]+)\/(history|input|resize|interrupt|disconnect)$/);
  if (terminal) {
    const reading = terminal[2] === 'history';
    if (request.method !== (reading ? 'GET' : 'POST')) throw new LakeError('Method not allowed', 405);
    const data = reading ? Object.fromEntries(url.searchParams) : await body(request);
    const { dshSessionId, projectId, ...payload } = data;
    sendJSON(response, 200, await backend.terminalCall(identifier(dshSessionId), identifier(projectId), terminal[1], terminal[2], reading ? undefined : payload)); return;
  }
  throw new LakeError('Lake native route not found', 404);
}
