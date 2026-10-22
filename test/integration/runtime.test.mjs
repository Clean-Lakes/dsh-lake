import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm, access, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { apply } from '../../lib/index.js';
import { resolveConfig } from '../../lib/config.js';
import { LakeRuntime } from '../../lib/runtime.js';
import { LakeBackend } from '../../lib/backend.js';
import { installTools } from '../../lib/tools.js';

test('real Lake process: native catalog, DSH ownership, PTY, persistence, exclusion and cleanup', { timeout: 45000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-lake-integration-'));
  const effects = [], routes = [];
  const ctx = {
    effect: fn => { const off = fn(); if (typeof off === 'function') effects.push(off); },
    inject: (deps, fn) => { if (!deps.includes('tools')) fn(ctx); },
    get: () => ({ requestRejection: () => undefined }),
    webServer: { register: route => { routes.push(route); return () => routes.splice(routes.indexOf(route), 1); } },
  };
  const runtime = apply(ctx, { home });
  const server = http.createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const route = routes.find(r => r.kind === 'exact' ? r.path === path : path === r.path || path.startsWith(r.path + '/'));
    if (route) void route.handler(req, res); else { res.writeHead(404); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/lake`;
  t.after(async () => {
    server.closeAllConnections(); server.close();
    for (const dispose of effects.reverse()) await dispose();
    await rm(home, { recursive: true, force: true });
  });
  async function api(path, method = 'GET', body) {
    const response = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
    const result = await response.json();
    assert.ok(response.ok, `${path}: ${JSON.stringify(result)}`);
    assert.equal(response.headers.get('set-cookie'), null);
    return result;
  }
  const [one, two] = await Promise.all([api('/catalog'), api('/catalog')]);
  assert.deepEqual(one, two);
  assert.equal('sessions' in one, false); assert.equal('models' in one, false);
  const firstPid = runtime.child.pid;
  const second = new LakeRuntime(resolveConfig({ home }));
  await assert.rejects(second.ensure(), /already in use/); await second.dispose();
  const project = await api('/projects', 'POST', { name: 'Native integration' });
  const catalog = await api('/catalog');
  const resource = catalog.resources.find(r => r.projectId === project.id && r.kind === 'local');
  assert.ok(resource);
  await api('/workspaces/dsh-workspace-one/resources', 'POST', { projectId: project.id });
  const linked = await api('/workspaces/dsh-workspace-one/resources');
  assert.equal(linked.project.id, project.id); assert.equal(linked.resources[0].id, resource.id);
  const otherGroup = await api('/workspaces/dsh-workspace-two/resources', 'POST', { name: 'Other DSH workspace' });
  assert.notEqual(otherGroup.id, project.id);
  assert.equal((await api('/workspaces/dsh-workspace-two/resources')).resources.some(r => r.id === resource.id), false);
  for (const path of ['/settings/model', '/projects/x/sessions', '/sessions/x/messages']) {
    const response = await fetch(base + '/api' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 404);
  }
  const identity = { dshSessionId: 'dsh-session-one', projectId: project.id };
  const { terminal } = await api('/terminals/open', 'POST', { ...identity, resourceId: resource.id });
  assert.equal(terminal.holder, 'user');
  await api(`/terminals/${terminal.id}/input`, 'POST', { ...identity, data: "printf '\\nDSH_NATIVE_PTY_OK\\n'\r" });
  let history;
  for (let n = 0; n < 40; n++) {
    history = await api(`/terminals/${terminal.id}/history?` + new URLSearchParams(identity));
    if (history.output.includes('DSH_NATIVE_PTY_OK\r\n')) break;
    await delay(50);
  }
  assert.ok(history.output.includes('DSH_NATIVE_PTY_OK\r\n'), 'PTY must execute printf, not merely echo input');
  const denied = await fetch(base + `/api/terminals/${terminal.id}/history?` + new URLSearchParams({ ...identity, dshSessionId: 'another-session' }));
  assert.ok([403, 404].includes(denied.status));
  const backend = new LakeBackend(runtime), tools = new Map();
  installTools({ on() {}, tools: { register: tool => tools.set(tool.name, tool) } }, backend);
  const command = tools.get('lake_run_command');
  const execution = { agent: { id: identity.dshSessionId }, callId: 'real-command', signal: new AbortController().signal };
  const result = JSON.parse(await command.execute({ resourceId: resource.id, command: "printf 'DSH_TOOL_COMMAND_OK\\n'" }, execution));
  assert.equal(result.exitCode, 0); assert.match(result.output, /DSH_TOOL_COMMAND_OK/);
  await assert.rejects(command.execute({ resourceId: resource.id, command: `rm -rf ${join(home, 'nonexistent-dangerous-target')}` }, { ...execution, callId: 'dangerous' }), /explicit target confirmation/);
  let stoppedTerminal;
  const originalTerminal = backend.terminal.bind(backend);
  backend.terminal = async (...args) => (stoppedTerminal = await originalTerminal(...args));
  const cancellation = new AbortController();
  const pending = command.execute({ resourceId: resource.id, command: 'sleep 20' }, { ...execution, callId: 'cancel-command', signal: cancellation.signal });
  // Wait for a command entry, then interrupt the real owned shell.
  let running;
  for (let n = 0; n < 60; n++) {
    if (stoppedTerminal) {
      running = await backend.terminalCall(identity.dshSessionId, project.id, stoppedTerminal.terminal.id, 'history');
      if (running.entries.length) break;
    }
    await delay(25);
  }
  assert.ok(running?.entries.length); cancellation.abort(); await assert.rejects(pending);
  for (let n = 0; n < 60; n++) {
    running = await backend.terminalCall(identity.dshSessionId, project.id, stoppedTerminal.terminal.id, 'history');
    if (running.entries.every(e => !['queued', 'running'].includes(e.status))) break;
    await delay(25);
  }
  assert.ok(running.entries.every(e => !['queued', 'running'].includes(e.status)), 'cancelled command must stop executing');
  // Kill/restart only this test-owned backend and ensure the same project survives.
  runtime.child.kill('SIGTERM'); await runtime.exitPromise;
  assert.equal(runtime.status().state, 'idle');
  const recovered = await api('/catalog');
  assert.ok(recovered.projects.some(p => p.id === project.id));
  assert.notEqual(runtime.child.pid, firstPid);
  const secondPid = runtime.child.pid;
  await runtime.dispose();
  assert.throws(() => process.kill(secondPid, 0), { code: 'ESRCH' });
  await assert.rejects(access(join(home, '.dsh-lake.lock')));
});

test('a symlink cannot bypass protected Lake homes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-lake-symlink-'));
  try {
    await symlink(join(homedir(), '.lake'), join(dir, 'home'));
    const runtime = new LakeRuntime(resolveConfig({ home: join(dir, 'home') }));
    await assert.rejects(runtime.ensure(), /protected Lake directory/);
    await runtime.dispose();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
