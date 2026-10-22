// Build navigation from stable resource IDs; a missing/stale tree node must not
// hide a usable resource. Search retains its ancestor folders.
export function resourceTree(resources, navigation = [], query = '') {
  const folders = new Map(), placements = new Map();
  for (const node of navigation) {
    if (node.kind === 'folder' && !folders.has(node.id)) folders.set(node.id, { type: 'folder', id: node.id, name: node.name, parentId: node.parentId, position: node.position, children: [] });
    if (node.kind === 'resource' && !placements.has(node.resourceId)) placements.set(node.resourceId, node);
  }
  const roots = [];
  function parentOf(parentId, childId) {
    const visited = new Set([childId]);
    let current = parentId;
    while (folders.has(current)) {
      if (visited.has(current)) return null;
      visited.add(current); current = folders.get(current).parentId;
    }
    return folders.get(parentId);
  }
  for (const folder of folders.values()) (parentOf(folder.parentId, folder.id)?.children || roots).push(folder);
  const seen = new Set();
  for (const resource of resources) {
    if (seen.has(resource.id)) continue;
    seen.add(resource.id);
    const node = placements.get(resource.id);
    const item = { type: 'resource', id: resource.id, resource, position: node?.position ?? Number.MAX_SAFE_INTEGER };
    // Built-in local access stays at the root, matching Lake's navigation.
    (resource.kind !== 'local' && parentOf(node?.parentId, resource.id)?.children || roots).push(item);
  }
  const needle = query.trim().toLocaleLowerCase();
  function select(items, parentMatches = false) {
    return items.sort((a, b) => Number(b.resource?.kind === 'local') - Number(a.resource?.kind === 'local') || a.position - b.position).flatMap(item => {
      if (item.type === 'resource') return !needle || parentMatches || (item.resource.name + ' ' + (item.resource.ssh?.host || item.resource.settings?.host || '')).toLocaleLowerCase().includes(needle) ? [item] : [];
      const matches = parentMatches || Boolean(needle && item.name.toLocaleLowerCase().includes(needle));
      const children = select(item.children, matches);
      if (needle && !matches && !children.length) return [];
      return [{ ...item, children, count: children.reduce((sum, child) => sum + (child.type === 'folder' ? child.count : 1), 0) }];
    });
  }
  return select(roots);
}

export function folderOptions(navigation = [], excludedId) {
  const options = [{ id: '', label: '资源根目录' }];
  function visit(nodes, prefix = '') {
    for (const node of nodes) {
      if (node.type !== 'folder' || node.id === excludedId) continue;
      const label = prefix + node.name;
      options.push({ id: node.id, label });
      visit(node.children, label + ' / ');
    }
  }
  visit(resourceTree([], navigation));
  return options;
}
