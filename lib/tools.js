import { setTimeout as delay } from 'node:timers/promises';
import { LakeError } from './backend.js';

const output = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] };
export function commandDecision(execution, previous) {
  if (execution.name !== 'lake_run_command' || previous.kind !== 'allow') return previous;
  return { kind: 'ask', reason: `Lake remote command on resource ${execution.arguments.resourceId}: ${execution.arguments.command}`, displayReason: { en: 'Run the displayed command on this Lake resource?', zh: `是否在 Lake 资源 ${execution.arguments.resourceId} 上执行以下命令？\n${execution.arguments.command}` } };
}
export function installTools(ctx, backend) {
  const invocations = new Map();
  ctx.on('tools/pre-execute', async (execution, next) => commandDecision(execution, await next()));
  ctx.tools.register({
    name: 'lake_resources', description: 'List Lake resources. Pass workspaceId from a resource reference to list only that DSH workspace. Omit it to discover all resource groups. Use exact returned resource ids for commands. No credentials or model settings are returned.',
    parameters: { type: 'object', properties: { workspaceId: { type: 'string' } }, additionalProperties: false }, output,
    execute: async (args, execution) => {
      if (!args.workspaceId) return JSON.stringify(await backend.catalog(execution.signal));
      const { workspaceId, project, resources } = await backend.workspace(args.workspaceId);
      return JSON.stringify({ workspaceId, project, resources });
    },
  });
  ctx.tools.register({
    name: 'lake_run_command', description: 'Run one command on a Lake local/SSH resource, after DSH human approval. Commands rejected as dangerous by Lake remain refused. Never replay a command whose result is unknown.',
    parameters: { type: 'object', properties: { resourceId: { type: 'string' }, command: { type: 'string' } }, required: ['resourceId', 'command'], additionalProperties: false }, output,
    execute(args, execution) {
      const key = execution.callId && execution.agent?.id + ':' + execution.callId;
      if (key && invocations.has(key)) return invocations.get(key);
      const pending = run(args, execution);
      // Repeated deliveries of the same host call share the original result,
      // including rejection or unknown outcomes. They never dispatch twice.
      if (key) invocations.set(key, pending);
      return pending;
    },
  });
  async function run(args, execution) {
      const sessionId = execution.agent?.id;
      if (!sessionId) throw new LakeError('Lake commands require an active DSH session');
      if (typeof args.command !== 'string' || !args.command.trim() || args.command.length > 12000) throw new LakeError('Invalid command');
      const { terminal, projectId } = await backend.terminal(sessionId, args.resourceId, false, execution.signal);
      let entry;
      try {
        // DSH's approval waterfall is the human authorization boundary. The
        // backend still rejects dangerous commands without its typed target.
        entry = await backend.terminalCall(sessionId, projectId, terminal.id, 'commands', { actor: 'user', command: args.command, confirmed: true }, execution.signal);
        const deadline = Date.now() + 120000;
        while (Date.now() < deadline) {
          const history = await backend.terminalCall(sessionId, projectId, terminal.id, 'history', undefined, execution.signal);
          const current = history.entries.find(item => item.id === entry.id);
          if (current && !['queued', 'running'].includes(current.status)) return JSON.stringify(current);
          await delay(100, undefined, { signal: execution.signal });
        }
        return JSON.stringify({ status: 'unknown', terminalId: terminal.id, entryId: entry.id, message: 'Command result is still pending. Do not replay it.' });
      } catch (error) {
        // Dispatch may have reached the shell even if cancellation interrupted
        // the HTTP reply before its entry id arrived.
        if (execution.signal?.aborted) await backend.terminalCall(sessionId, projectId, terminal.id, 'interrupt', {}).catch(() => {});
        throw error;
      }
  }
}
