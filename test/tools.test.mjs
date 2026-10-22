import test from 'node:test';
import assert from 'node:assert/strict';
import { commandDecision, installTools } from '../lib/tools.js';

const request = { name: 'lake_run_command', arguments: { resourceId: 'local', command: 'printf harmless' } };
test('commands ask DSH approval, preserving preceding denial/cancellation/ask', () => {
  assert.equal(commandDecision(request, { kind: 'allow' }).kind, 'ask');
  for (const kind of ['deny', 'cancel', 'ask']) { const decision = { kind }; assert.equal(commandDecision(request, decision), decision); }
  assert.equal(commandDecision({ name: 'lake_resources' }, { kind: 'allow' }).kind, 'allow');
});
function registry(backend) {
  const tools = new Map(); installTools({ on() {}, tools: { register: tool => tools.set(tool.name, tool) } }, backend); return tools;
}
test('command identity uses the DSH agent id and never fabricates dangerous target confirmation', async () => {
  let calls = 0;
  const tools = registry({ terminal: async id => { assert.equal(id, 'dsh-session'); return { terminal: { id: 'terminal' }, projectId: 'project' }; }, terminalCall: async (session, project, terminal, operation, body) => {
    calls++; assert.equal(operation, 'commands'); assert.equal(body.confirmation, undefined); assert.equal(body.confirmed, true); throw new Error('dangerous target confirmation required');
  } });
  await assert.rejects(tools.get('lake_run_command').execute(request.arguments, { agent: { id: 'dsh-session' } }), /confirmation required/);
  assert.equal(calls, 1);
  await assert.rejects(tools.get('lake_run_command').execute(request.arguments, {}), /active DSH session/);
});
test('cancelling a dispatched command interrupts its owned terminal without replay', async () => {
  const controller = new AbortController(), ops = [];
  const tool = registry({ terminal: async () => ({ terminal: { id: 'terminal' }, projectId: 'project' }), terminalCall: async (_s, _p, _t, op) => {
    ops.push(op); if (op === 'commands') return { id: 'entry' };
    if (op === 'history') { controller.abort(); throw controller.signal.reason; }
    return {};
  } }).get('lake_run_command');
  await assert.rejects(tool.execute(request.arguments, { agent: { id: 'dsh-session' }, signal: controller.signal }));
  assert.deepEqual(ops, ['commands', 'history', 'interrupt']);
});
test('the same DSH call id is dispatched only once, including cancelled deliveries', async () => {
  let calls = 0;
  const tool = registry({ terminal: async () => ({ terminal: { id: 'terminal' }, projectId: 'project' }), terminalCall: async (_s, _p, _t, op) => {
    if (op === 'commands') { calls++; return { id: 'entry' }; }
    return { entries: [{ id: 'entry', status: 'completed', exitCode: 0 }] };
  } }).get('lake_run_command');
  const execution = { agent: { id: 'session' }, callId: 'call-1', signal: new AbortController().signal };
  const results = await Promise.all([tool.execute(request.arguments, execution), tool.execute(request.arguments, execution)]);
  assert.equal(results[0], results[1]); assert.equal(calls, 1);
});
test('workspace resource tool returns only the requested group and excludes migration choices', async()=>{
  const tool=registry({workspace:async id=>({workspaceId:id,project:{id:'project'},resources:[{id:'host'}],availableProjects:[{id:'unrelated'}]})}).get('lake_resources');
  const result=JSON.parse(await tool.execute({workspaceId:'workspace'},{}));
  assert.equal(result.workspaceId,'workspace');assert.deepEqual(result.resources,[{id:'host'}]);assert.equal('availableProjects' in result,false);
});
