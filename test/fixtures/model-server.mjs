// Isolated browser verification only; never contacts an external provider.
import http from 'node:http';
let last = {}; let calls = 0;
const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/inspection') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(last)); return; }
  if (req.method === 'GET') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ object: 'list', data: [{ id: 'lake-native-mock', object: 'model', owned_by: 'test' }] })); return; }
  let data = ''; for await (const chunk of req) data += chunk;
  const body = JSON.parse(data);
  const inspection = { model: body.model, stream: body.stream, tools: body.tools?.map(t => t.function?.name), toolSchemas: body.tools?.filter(t => ['run_code','lake_run_command'].includes(t.function?.name)), userMessages: body.messages?.filter(m => m.role === 'user').map(m => m.content), lastRole: body.messages?.at(-1)?.role };
  if (body.tools?.length || !last.tools) last = inspection;
  if (body.tools?.length) last.fullTools = body.tools.map(t=>t.function?.name);
  console.log(JSON.stringify({ model: last.model, stream: last.stream, tools: last.tools, lastRole: last.lastRole }));
  const lastUser = body.messages?.findLast(m => m.role === 'user')?.content;
  const text = typeof lastUser === 'string' ? lastUser : JSON.stringify(lastUser);
  const resourceId = text?.match(/resourceId: ([\w-]+)/)?.[1];
  const wantsCommand = text?.includes('DSH_APPROVAL_TEST') && resourceId && body.tools?.some(t => t.function?.name === 'lake_run_command');
  const needsTool = wantsCommand && body.messages?.at(-1)?.role !== 'tool';
  const tool = needsTool ? { id: 'call-lake-verify-' + (++calls), type: 'function', function: { name: 'lake_run_command', arguments: JSON.stringify({ resourceId, command: "printf 'DSH_APPROVED_COMMAND_OK\\n'" }) } } : null;
  const response = wantsCommand ? 'DSH_APPROVAL_FINISHED：命令审批流程已结束。' : 'DSH_NATIVE_SHARED_OK：此回复来自 DSH 配置的本地验证模型。';
  const completion = { id: 'chatcmpl-native-test', object: 'chat.completion', created: Math.floor(Date.now()/1000), model: body.model, choices: [{ index: 0, message: { role: 'assistant', ...(tool ? { content: null, tool_calls: [tool] } : { content: response }) }, finish_reason: tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
  if (!body.stream) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(completion)); return; }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  for (const [delta, finish_reason] of [[{ role: 'assistant', ...(tool ? { tool_calls: [{ index: 0, ...tool }] } : { content: response }) }, null], [{}, tool ? 'tool_calls' : 'stop']]) res.write('data: '+JSON.stringify({ ...completion, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }] })+'\n\n');
  res.end('data: [DONE]\n\n');
});
server.listen(63188, '127.0.0.1', () => console.log('Lake mock provider listening on 63188'));
