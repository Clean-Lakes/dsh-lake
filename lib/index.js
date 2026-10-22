import { resolveConfig } from './config.js';
import { LakeRuntime } from './runtime.js';
import { admitted, sendJSON } from './proxy.js';
import { LakeBackend } from './backend.js';
import { nativeRoute } from './native-routes.js';
import { installTools } from './tools.js';

export const name = 'lake';

export function apply(ctx, input = {}) {
  const config = resolveConfig(input);
  const runtime = new LakeRuntime(config);
  const backend = new LakeBackend(runtime);
  ctx.inject(['tools'], toolCtx => installTools(toolCtx, backend));
  const onExit = () => { runtime.child?.kill('SIGTERM'); };
  process.once('exit', onExit);
  ctx.effect(() => () => { process.removeListener('exit', onExit); return runtime.dispose(); });
  ctx.inject(['webServer'], host => {
    const handler = async (request, response) => {
      try {
        const rejection = admitted(host, request);
        if (rejection) { sendJSON(response, rejection, { error: 'DSH authentication or same-origin access required' }); return; }
        if (new URL(request.url, 'http://localhost').pathname === '/lake/status') {
          if (request.method !== 'GET') { sendJSON(response, 405, { error: 'Method not allowed' }); return; }
          sendJSON(response, 200, { ...runtime.status(), sourceBranch: 'develop', sourceCommit: '89a02c6c85d972c70579a14e238bac80be281fbb' });
          return;
        }
        await nativeRoute(backend, request, response);
      } catch (error) {
        // Internal child output can contain startup credentials. Only our own
        // bounded lifecycle errors are exposed; never forward raw child logs.
        if (!response.headersSent) sendJSON(response, error.status ?? 503, { error: error.status ? error.message : error.message.startsWith('Lake ') ? error.message : 'Lake plugin could not start; check plugin configuration and build' });
        else response.destroy();
      }
    };
    for (const route of [{ kind: 'exact', path: '/lake/status' }, { kind: 'prefix', path: '/lake/api' }]) {
      host.effect(() => host.webServer.register({ ...route, handler }));
    }
  });
  return runtime;
}
