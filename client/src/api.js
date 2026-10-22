export async function api(path, method = 'GET', body, signal) {
  const target = new URL('lake/api' + path, document.baseURI);
  const response = await fetch(target.pathname + target.search, {
    method, cache: 'no-store', headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error === 'Lake native route not found' ? '管理接口尚未加载，请完全退出并重新启动 DSH 后重试' : result.error || `HTTP ${response.status}`);
  return result;
}

export async function workspaceResources(workspaceId, signal, request = api) {
  const data = await request(`/workspaces/${workspaceId}/resources`, 'GET', undefined, signal);
  // A running 0.3.1 backend still provides the tree through its catalog, so
  // updated clients can show folders before the host backend is restarted.
  if (data.project && !Array.isArray(data.resourceTree)) {
    const catalog = await request('/catalog', 'GET', undefined, signal);
    return { ...data, resourceTree: catalog.resourceTree.filter(node => node.projectId === data.project.id) };
  }
  return data;
}
