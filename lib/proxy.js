export function sendJSON(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(data));
}

function loopback(host) {
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(`http://${host}`).hostname); }
  catch { return false; }
}

// The bearer added downstream grants the full Lake API. Admit the request at
// DSH's connection boundary BEFORE starting the backend or adding that bearer.
export function admitted(ctx, request) {
  const connection = ctx.get?.('connection');
  if (typeof connection?.requestRejection === 'function') {
    const rejected = connection.requestRejection(request);
    if (rejected) return rejected;
  } else {
    const remote = request.socket.remoteAddress;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote) || !loopback(request.headers.host)) return 403;
  }
  if (request.headers['sec-fetch-site'] === 'cross-site') return 403;
  const origin = request.headers.origin;
  if (origin !== undefined) {
    try { if (new URL(origin).host !== request.headers.host) return 403; }
    catch { return 403; }
  }
  return 0;
}
