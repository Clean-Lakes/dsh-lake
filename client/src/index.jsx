import React, { useState, useEffect, useSyncExternalStore } from 'react';
import terminalCSS from '@xterm/xterm/css/xterm.css';
import styles from './styles.css';
import { api, workspaceResources } from './api.js';
import { createUIState, currentWorkspace, workspaceLabel } from './state.js';
import { resourceReference, resourceSource, resourceSourceName, resourceTextRule } from './references.js';
import { resourceTree } from './resource-tree.js';
import { Icon, ResourceForm, HostTrust, ResourceTerminal, useDialogFocus } from './components.jsx';
import { ResourceManager } from './management.jsx';

export const name = 'lake';
export const inject = ['slots', 'sessions', 'workspaces', 'uiSession', 'uiConversation', 'conversation', 'uiWorkspace', 'layout', 'inputTriggers'];
function useHostWorkspace(props) {
  const ctx = props.host, source = ctx.uiSession.adapter.current;
  const binding = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  const workspaces = props.useWorkspaces(state => state), sessions = props.useSessions(state => state);
  return { workspace: currentWorkspace(workspaces.items, sessions, binding.props.sessionId), workspaces: workspaces.items, sessionId: binding.props.sessionId };
}
function useResources(workspaceId, revision) {
  const [result, setResult] = useState({ workspaceId: null, data: null, error: '' });
  useEffect(() => {
    if (!workspaceId) { setResult({ workspaceId: null, data: null, error: '' }); return; }
    const controller = new AbortController(); setResult({ workspaceId, data: null, error: '' });
    workspaceResources(workspaceId, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult({ workspaceId, data, error: '' }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ workspaceId, data: null, error: error.message }); });
    return () => controller.abort();
  }, [workspaceId, revision]);
  return result.workspaceId === workspaceId ? result : { data: null, error: '' };
}
async function reference(ctx, ui, resource, workspace, insertion) {
  try {
    let sessionId = ctx.uiSession.adapter.current.getSnapshot().props.sessionId;
    if (!sessionId) { await ctx.uiWorkspace.openWorkspace(workspace.workspaceId); sessionId = ctx.uiSession.adapter.current.getSnapshot().props.sessionId; }
    if (!sessionId || (insertion && insertion.sessionId !== sessionId)) throw new Error('会话已变化，请重新选择资源');
    const binding = ctx.sessions.binding(sessionId), input = ctx.conversation.input.for(binding.ctx);
    const snapshot = input.state.getSnapshot();
    const reference = resourceReference(resource, workspace.workspaceId);
    const applied = input.insertReference(reference, insertion?.span || { start: snapshot.draft.length, end: snapshot.draft.length, draftRev: snapshot.draftRev });
    if (!applied) throw new Error('草稿已变化或正在提交，已保留原内容，请重新选择资源');
    ui.set({ picker: null, notice: null }); ctx.layout.selectPanel(null); input.focus();
  } catch (error) { ui.set({ notice: error.message }); }
}
function ResourceRows({ resources, navigation, query = '', workspace, host, ui, insertion }) {
  const state = useSyncExternalStore(ui.subscribe, ui.getSnapshot, ui.getSnapshot);
  const nodes = resourceTree(resources, navigation, query), expanded = state.expandedResourceFolders[workspace.workspaceId] || [];
  function toggle(id) {
    ui.set({ expandedResourceFolders: { ...state.expandedResourceFolders, [workspace.workspaceId]: expanded.includes(id) ? expanded.filter(value => value !== id) : [...expanded, id] } });
  }
  function manage(kind, id, name) { ui.set({ picker: null, manage: { kind, id, name, operation: 'view', workspaceId: workspace.workspaceId } }); }
  function entries(items, nested = false) {
    return <ul className={nested ? 'lake-resource-children' : 'lake-resource-list'} aria-label={nested ? undefined : '资源目录'}>{items.map(item => {
      if (item.type === 'folder') {
        const open = Boolean(query.trim()) || expanded.includes(item.id);
        return <li className="lake-resource-branch" key={'folder:' + item.id}><div className="lake-folder-row"><button className="lake-resource-folder" aria-expanded={open} onClick={() => toggle(item.id)}><Icon name="chevron" size={12}/><Icon name="folder" size={16}/><span>{item.name}</span><small>{item.count}</small></button><button className="lake-icon" aria-label={`管理目录 ${item.name}`} title="管理目录" onClick={() => manage('folder', item.id, item.name)}><Icon name="more" size={16}/></button></div>{open && entries(item.children, true)}</li>;
      }
      const resource = item.resource;
      return <li className="lake-resource-branch" key={'resource:' + resource.id}><article className={'lake-resource-row' + (state.terminal?.resource.id === resource.id ? ' selected' : '')}>
    <Icon name={resource.kind === 'database' ? 'database' : resource.kind === 'redis' ? 'database' : 'host'} size={16}/><div><button className="lake-resource-label" title={resource.name} aria-label={`查看资源 ${resource.name}`} onClick={() => manage('resource', resource.id, resource.name)}><strong>{resource.name}</strong><small>{resource.ssh?.host || resource.settings?.host || (resource.kind === 'local' ? '本机' : resource.kind)}</small></button></div>
    <button className="lake-icon" aria-label={`引用资源 ${resource.name}`} title="引用到当前 DSH 对话" onClick={() => void reference(host, ui, resource, workspace, insertion)}><Icon name="chat" size={15}/></button>
    {['local', 'ssh'].includes(resource.kind) && <button className="lake-icon" aria-label={`打开终端 ${resource.name}`} title="打开资源终端" onClick={() => ui.set({ terminal: { resource, workspaceId: workspace.workspaceId, workspaceTitle: workspaceLabel(workspace), scopeId: 'workspace-' + workspace.workspaceId }, picker: null })}><Icon name="terminal" size={16}/></button>}
    <button className="lake-icon" aria-label={`管理资源 ${resource.name}`} title="管理资源" onClick={() => manage('resource', resource.id, resource.name)}><Icon name="more" size={16}/></button>
  </article></li>;
    })}</ul>;
  }
  return nodes.length ? entries(nodes) : <p className="lake-muted">没有匹配的资源</p>;
}
function WorkspaceSetup({ workspace, data, ui }) {
  const [projectId, setProjectId] = useState(''), [busy, setBusy] = useState(false);
  async function bind() {
    setBusy(true);
    try { await api(`/workspaces/${workspace.workspaceId}/resources`, 'POST', projectId ? { projectId } : { name: workspace.title }); ui.refresh(); }
    catch (error) { ui.set({ notice: error.message }); } finally { setBusy(false); }
  }
  return <div className="lake-resource-empty"><p>为此工作区关联主机与终端</p>{data.availableProjects.length > 0 && <select aria-label="关联已有 Lake 资源" value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">新建资源分组</option>{data.availableProjects.map(project => <option key={project.id} value={project.id}>关联：{project.name}</option>)}</select>}<button className="lake-button" disabled={busy} onClick={() => void bind()}><Icon name="plus" size={14}/>{busy ? '关联中…' : projectId ? '关联已有资源' : '启用资源区'}</button></div>;
}
function ResourcesSection(props) {
  const { host, ui } = props, { workspace } = useHostWorkspace(props);
  const state = useSyncExternalStore(ui.subscribe, ui.getSnapshot, ui.getSnapshot);
  const { data, error } = useResources(workspace?.workspaceId, state.revision);
  const [collapsed, setCollapsed] = useState(false), [searching, setSearching] = useState(false), [query, setQuery] = useState('');
  if (!props.wide) return <div className="lake-surface lake-resource-rail"><button className="lake-icon" aria-label="资源区" title="工作区资源" onClick={() => ui.set({ picker: {} })}><Icon name="host"/></button></div>;
  return <section className="lake-surface lake-resources-section" aria-label="工作区资源区" data-workspace-id={workspace?.workspaceId}>
    <header><button className="lake-section-toggle" aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}><Icon name="chevron" size={14}/><span>资源区</span><small>{data?.resources.length || 0}</small></button><div><button className="lake-icon" aria-label="搜索工作区资源" onClick={() => setSearching(value => !value)}><Icon name="search" size={15}/></button><button className="lake-icon" aria-label="刷新工作区资源" onClick={() => ui.refresh()}><Icon name="refresh" size={14}/></button><button className="lake-icon" aria-label="新建目录" title="新建目录" disabled={!data?.project} onClick={() => ui.set({ manage: { kind: 'folder', operation: 'create', workspaceId: workspace.workspaceId, parentId: '' } })}><Icon name="folderPlus" size={16}/></button><button className="lake-icon" aria-label="添加 SSH 主机" title="添加 SSH 主机" disabled={!data?.project} onClick={() => ui.set({ form: { navigation: data.resourceTree, workspaceId: workspace.workspaceId } })}><Icon name="plus" size={16}/></button></div></header>
    {!collapsed && <>
      {searching && <input className="lake-resource-search" autoFocus aria-label="搜索资源" placeholder="主机名称或地址" value={query} onChange={event => setQuery(event.target.value)}/>}
      {error ? <p className="lake-error" role="alert">{error}</p> : !workspace ? <p className="lake-muted">先在 DSH 添加工作区</p> : !data ? <p className="lake-muted">正在读取资源…</p> : !data.project ? <WorkspaceSetup key={workspace.workspaceId} workspace={workspace} data={data} ui={ui}/> : <ResourceRows resources={data.resources} navigation={data.resourceTree} query={searching ? query : ''} workspace={workspace} host={host} ui={ui}/>}
    </>}
  </section>;
}
function ResourcePicker({ workspace, data, host, ui, insertion }) {
  const dialog = useDialogFocus(), [query, setQuery] = useState('');
  return <div className="lake-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) ui.set({ picker: null }); }}><section ref={dialog} className="lake-modal" role="dialog" aria-modal="true" aria-label="选择工作区资源" onKeyDown={event => { if (event.key === 'Escape') ui.set({ picker: null }); }}>
    <header><div><small>WORKSPACE RESOURCES</small><h2>选择资源</h2></div><button className="lake-icon" aria-label="关闭资源选择" onClick={() => ui.set({ picker: null })}><Icon name="close"/></button></header>
    <input className="lake-resource-search" aria-label="搜索可引用资源" placeholder="搜索主机名称或地址" value={query} onChange={event => setQuery(event.target.value)}/>
    {!workspace ? <p className="lake-muted">先在 DSH 选择一个工作区</p> : !data ? <p className="lake-muted">正在读取资源…</p> : !data.project ? <WorkspaceSetup key={workspace.workspaceId} workspace={workspace} data={data} ui={ui}/> : <ResourceRows resources={data.resources} navigation={data.resourceTree} query={query} workspace={workspace} host={host} ui={ui} insertion={insertion}/>}
  </section></div>;
}
function ComposerResources(props) {
  return <button className="lake-surface lake-composer-resource" aria-label="引用工作区资源" title="@ 引用工作区资源" onClick={() => {
    try { const binding = props.host.sessions.binding(props.sessionId); props.host.inputTriggers.sessionOf(binding.ctx).toggleSource(resourceSourceName, { trigger: '@', query: '', quoted: false, position: 'inline', span: props.inputActions.captureInsertion() }); }
    catch (error) { props.ui.set({ notice: error.message }); }
  }}><Icon name="host" size={16}/><span>资源</span></button>;
}
function IntegrationOverlays(props) {
  const { host, ui } = props, state = useSyncExternalStore(ui.subscribe, ui.getSnapshot, ui.getSnapshot);
  const { workspace, sessionId } = useHostWorkspace(props), { data, error: loadError } = useResources(state.picker || state.manage || state.form ? workspace?.workspaceId : null, state.revision);
  const [trust, setTrust] = useState(null);
  useEffect(() => { if (state.terminal && state.terminal.workspaceId !== workspace?.workspaceId) ui.set({ terminal: null }); }, [workspace?.workspaceId, state.terminal?.workspaceId]);
  useEffect(() => {
    if (state.manage && state.manage.workspaceId !== workspace?.workspaceId) ui.set({ manage: null });
    if (state.form && state.form.workspaceId !== workspace?.workspaceId) ui.set({ form: null });
  }, [workspace?.workspaceId, state.manage?.workspaceId, state.form?.workspaceId]);
  useEffect(() => {
    const controller = new AbortController(); let timer;
    const scopes = [...new Set([sessionId, state.terminal?.scopeId].filter(Boolean))];
    async function poll() {
      let found = null;
      for (const scope of scopes) {
        try { const pending = await api('/trust?' + new URLSearchParams({ dshSessionId: scope }), 'GET', undefined, controller.signal); if (pending) { found = { ...pending, sessionId: scope }; break; } } catch {}
      }
      if (!controller.signal.aborted) { setTrust(found); timer = setTimeout(poll, 1200); }
    }
    if (scopes.length) void poll(); else setTrust(null);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [sessionId, state.terminal?.scopeId]);
  return <div className="lake-surface lake-overlays">
    {state.notice && <div className="lake-toast" role="alert"><span>{state.notice}</span><button className="lake-icon" aria-label="关闭资源提示" onClick={() => ui.set({ notice: null })}><Icon name="close" size={14}/></button></div>}
    {state.picker && !trust && <ResourcePicker workspace={workspace} data={data} host={host} ui={ui} insertion={state.picker.span ? state.picker : null}/>}
    {state.manage && !trust && <ResourceManager key={[state.manage.workspaceId, state.manage.kind, state.manage.id, state.manage.operation, state.manage.parentId].join(':')} action={state.manage} data={data} loadError={loadError} ui={ui} onClose={() => ui.set({ manage: null })} onSaved={() => ui.refresh()}/>}
    {state.form && !trust && <ResourceForm key={state.form.resource?.id || 'new'} {...state.form} navigation={data?.resourceTree || state.form.navigation} onClose={() => ui.set({ form: null })} onSaved={(saved, parentId) => {
      const current = ui.getSnapshot(), expanded = new Set(current.expandedResourceFolders[workspace.workspaceId] || []);
      let id = parentId; while (id && !expanded.has(id)) { expanded.add(id); id = data?.resourceTree.find(node => node.id === id)?.parentId; }
      ui.set({ expandedResourceFolders: { ...current.expandedResourceFolders, [workspace.workspaceId]: [...expanded] }, ...(current.terminal?.resource.id === saved.id ? { terminal: { ...current.terminal, resource: saved } } : {}) });
      ui.refresh();
    }}/>}
    {trust && <HostTrust key={trust.prompt.id} trust={trust} sessionId={trust.sessionId} onDone={() => setTrust(null)}/>}
  </div>;
}
function TerminalDock({ ui, floating }) {
  const state = useSyncExternalStore(ui.subscribe, ui.getSnapshot, ui.getSnapshot);
  if (!state.terminal) return null;
  const { resource, scopeId, workspaceTitle } = state.terminal;
  return <div className={'lake-surface lake-terminal-dock' + (floating ? ' lake-floating-terminal' : '')} data-workspace-title={workspaceTitle}><ResourceTerminal key={scopeId + resource.id} resource={resource} sessionId={scopeId} onClose={() => ui.set({ terminal: null })}/></div>;
}
function ResourceMessageTag({ node }) {
  const data = node.data;
  return <span className="lake-surface lake-message-resource" title={data.host || data.kind}><Icon name="host" size={14}/><span>{data.name}</span></span>;
}
export function apply(ctx) {
  const ui = createUIState();
  if (ctx.layout?.panelInfo?.getSnapshot()?.activePanelId === 'lake') ctx.layout.selectPanel(null);
  ctx.effect(() => ctx.inputTriggers.registerSource(resourceSource(ctx, () => ui.set({ picker: {} }))));
  ctx.effect(() => ctx.uiConversation.userText.register(resourceTextRule));
  ctx.slots.inject('conversation.user.text.node', () => ctx.slots.register({ name: 'conversation.user.text.node', key: resourceSourceName }, ResourceMessageTag));
  ctx.effect(() => { const style = document.createElement('style'); style.dataset.dshLake = 'workspace'; style.textContent = terminalCSS + '\n' + styles; document.head.append(style); return () => style.remove(); });
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name: 'sidebar.footer.action', id: 'lake.resources', order: -100, inject: () => ({ host: ctx, ui }) }, ResourcesSection));
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'lake.resources', order: 80, inject: () => ({ ui, host: ctx }) }, ComposerResources));
  ctx.slots.inject('shell.overlay', () => {
    const offOverlay = ctx.slots.register({ name: 'shell.overlay', id: 'lake.resources', order: 80, inject: () => ({ host: ctx, ui }) }, IntegrationOverlays);
    let offTerminal = () => {};
    const offBottom = ctx.slots.inject('shell.bottom', () => {
      const occupied = ctx.slots.entriesOfSlot('shell.bottom').length > 0;
      offTerminal = ctx.slots.register(occupied ? { name: 'shell.overlay', id: 'lake.terminal', order: 60, inject: () => ({ ui, floating: true }) } : { name: 'shell.bottom', priority: 100, inject: () => ({ ui, floating: false }) }, TerminalDock);
      return () => offTerminal();
    });
    return () => { offBottom(); offOverlay(); };
  });
}
