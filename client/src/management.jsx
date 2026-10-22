import React, { useState } from 'react';
import { api } from './api.js';
import { Icon, useDialogFocus } from './components.jsx';
import { folderOptions, resourceTree } from './resource-tree.js';

export function ResourceManager({ action, data, loadError, ui, onClose, onSaved }) {
  const dialog = useDialogFocus(), folder = action.kind === 'folder', operation = action.operation || 'view';
  const navigation = data?.resourceTree || [];
  const resource = data?.resources.find(item => item.id === action.id);
  const node = navigation.find(item => folder ? item.id === action.id : item.resourceId === action.id);
  const item = folder ? node : resource;
  const [name, setName] = useState(action.name || item?.name || '');
  const [parentId, setParentId] = useState(action.parentId ?? node?.parentId ?? '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const label = folder ? '目录' : '资源';
  const title = { view: folder ? '管理目录' : '资源详情', create: '新建目录', rename: '重命名目录', move: `移动${label}`, delete: `删除${label}` }[operation];
  const options = folderOptions(navigation, operation === 'move' && folder ? action.id : undefined);
  const base = `/workspaces/${action.workspaceId}`;
  function change(next) {
    ui.set({ manage: { ...action, operation: next, name: item?.name, parentId: node?.parentId || '' } });
  }
  function expandParents(id) {
    const current = ui.getSnapshot().expandedResourceFolders, ids = new Set(current[action.workspaceId] || []);
    while (id && !ids.has(id)) { ids.add(id); id = navigation.find(entry => entry.id === id)?.parentId; }
    ui.set({ expandedResourceFolders: { ...current, [action.workspaceId]: [...ids] } });
  }
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      if (operation === 'delete' && !folder) await api(base + '/resource-items/' + resource.id, 'DELETE');
      else {
        const payload = { operation };
        if (operation !== 'create') payload.nodeId = node?.id;
        if (['create', 'rename'].includes(operation)) payload.name = name;
        if (['create', 'move'].includes(operation)) payload.parentId = parentId;
        await api(base + '/resource-tree', 'POST', payload);
      }
      if (['create', 'move'].includes(operation)) expandParents(parentId);
      onSaved(); onClose();
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  const config = resource?.ssh || resource?.settings || {};
  const details = folder ? [['目录名称', node?.name], ['所在位置', folderOptions(navigation).find(entry => entry.id === node?.parentId)?.label || '资源根目录']] : [
    ['名称', resource?.name], ['类型', { local: '本机终端', ssh: 'SSH 终端', database: '数据库', redis: 'Redis', docker: 'Docker' }[resource?.kind]],
    ['主机地址', config.host], ['端口', config.port], ['登录用户', config.username], ['登录方式', resource?.kind === 'ssh' ? config.authMethod === 'password' ? '密码（已保存）' : 'SSH 密钥（已保存）' : undefined],
    ['Shell', ['ssh', 'local'].includes(resource?.kind) ? config.shell || '默认' : undefined], ['所在目录', folderOptions(navigation).find(entry => entry.id === node?.parentId)?.label || '资源根目录'],
  ];
  function folderCount(nodes) { for (const entry of nodes) { if (entry.id === action.id && entry.type === 'folder') return entry.count; const found = entry.children && folderCount(entry.children); if (found !== undefined) return found; } }
  if (folder && operation === 'view' && data) details.push(['资源数量', folderCount(resourceTree(data.resources, navigation)) || 0]);
  return <div className="lake-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}><section ref={dialog} className="lake-modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={event => { if (event.key === 'Escape' && !busy) onClose(); }}>
    <header><div><small>LAKE RESOURCES</small><h2>{title}</h2></div><button className="lake-icon" aria-label="关闭" disabled={busy} onClick={onClose}><Icon name="close"/></button></header>
    {loadError ? <p className="lake-error" role="alert">{loadError}</p> : !data ? <p className="lake-muted">正在读取资源…</p> : operation !== 'create' && !item ? <p role="alert" className="lake-error">此{label}已被移除，请关闭后刷新资源区。</p> : operation === 'view' ? <>
      <dl className="lake-resource-details">{details.filter(([, value]) => value !== undefined).map(([key, value]) => <React.Fragment key={key}><dt>{key}</dt><dd>{value}</dd></React.Fragment>)}</dl>
      <div className="lake-management-actions">{folder ? <>
        <button className="lake-button" onClick={() => ui.set({ manage: { kind: 'folder', operation: 'create', workspaceId: action.workspaceId, parentId: node.id } })}>新建子目录</button>
        <button className="lake-button" onClick={() => ui.set({ manage: null, form: { workspaceId: action.workspaceId, parentId: node.id, navigation } })}>添加 SSH 主机</button>
        <button className="lake-button" onClick={() => change('rename')}>重命名</button>
      </> : ['local', 'ssh'].includes(resource.kind) && <button className="lake-button" onClick={() => ui.set({ manage: null, form: { workspaceId: action.workspaceId, resource, navigation } })}>编辑终端</button>}
      {(folder || resource.kind !== 'local') && <><button className="lake-button" onClick={() => change('move')}>移动{label}</button><button className="lake-button lake-danger" onClick={() => change('delete')}>删除{label}</button></>}
      </div>
    </> : <form onSubmit={submit}><fieldset disabled={busy} className="lake-fields">
      {['create', 'rename'].includes(operation) && <label>目录名称<input aria-label="目录名称" required maxLength={120} value={name} onChange={event => setName(event.target.value)}/></label>}
      {['create', 'move'].includes(operation) && <label>目标目录<select aria-label="目标目录" value={parentId} onChange={event => setParentId(event.target.value)}>{options.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>}
      {operation === 'delete' && <p className="lake-delete-description">删除“{item.name}”？{folder ? '目录中的资源和子目录将移到上一级。' : '资源连接将移入回收站，历史记录保留。'}</p>}
      </fieldset>{error && <p className="lake-error" role="alert">{error}</p>}<footer><button type="button" className="lake-button" disabled={busy} onClick={onClose}>取消</button><button className={'lake-button ' + (operation === 'delete' ? 'lake-danger' : 'lake-primary')} disabled={busy}>{busy ? '处理中…' : operation === 'delete' ? `删除${label}` : operation === 'create' ? '创建目录' : '保存修改'}</button></footer>
    </form>}
  </section></div>;
}
