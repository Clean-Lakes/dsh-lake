import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export class LakeError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function identifier(value, name = 'id') {
  if (typeof value !== 'string' || !/^[\w-]{1,160}$/.test(value)) throw new LakeError(`Invalid ${name}`);
  return value;
}

export class LakeBackend {
  constructor(runtime) { this.runtime = runtime; this.bindings = null; this.queue = Promise.resolve(); }
  async call(path, method = 'GET', data, signal) {
    const session = await this.runtime.ensure();
    const response = await fetch(session.origin + '/api' + path, {
      method, headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: signal ?? AbortSignal.timeout(15000),
    });
    const result = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new LakeError(result?.error || `Lake HTTP ${response.status}`, response.status);
    return result;
  }
  async catalog(signal) {
    const data = await this.call('/catalog', 'GET', undefined, signal);
    // Human conversations and providers belong to DSH, never this projection.
    return { projects: data.projects, resources: data.resources, resourceTree: data.resourceTree };
  }
  async resource(id, signal) {
    identifier(id, 'resourceId');
    const resource = (await this.catalog(signal)).resources.find(item => item.id === id);
    if (!resource) throw new LakeError('资源不存在', 404);
    return resource;
  }
  async workspaceMap() {
    await this.runtime.ensure();
    try {
      const map = JSON.parse(await readFile(join(this.runtime.config.home, 'dsh-workspace-projects.json'), 'utf8'));
      if (!map || typeof map !== 'object' || Array.isArray(map) || Object.values(map).some(id => typeof id !== 'string' || !/^[\w-]{1,160}$/.test(id))) throw new Error('Invalid map');
      return map;
    } catch (error) { if (error.code === 'ENOENT') return {}; throw new LakeError('工作区资源关联文件损坏', 500); }
  }
  async workspace(workspaceId) {
    identifier(workspaceId, 'workspaceId');
    await this.queue;
    const map = await this.workspaceMap(), catalog = await this.catalog();
    const project = catalog.projects.find(item => item.id === map[workspaceId]) || null;
    return { workspaceId, project, resources: project ? catalog.resources.filter(item => item.projectId === project.id) : [], resourceTree: project ? catalog.resourceTree.filter(item => item.projectId === project.id) : [], availableProjects: project ? [] : catalog.projects };
  }
  async bindWorkspace(workspaceId, data) {
    identifier(workspaceId, 'workspaceId');
    const operation = async () => {
      const map = await this.workspaceMap(), catalog = await this.catalog();
      const existing = catalog.projects.find(item => item.id === map[workspaceId]);
      if (existing) {
        if (data.projectId && data.projectId !== existing.id) throw new LakeError('工作区已有资源关联，请保留原关联', 409);
        return existing;
      }
      let project;
      if (data.projectId) {
        project = catalog.projects.find(item => item.id === identifier(data.projectId, 'projectId'));
        if (!project) throw new LakeError('资源项目不存在', 404);
      } else project = await this.call('/projects', 'POST', { name: data.name });
      map[workspaceId] = project.id;
      const path = join(this.runtime.config.home, 'dsh-workspace-projects.json');
      await writeFile(path + '.tmp', JSON.stringify(map), { mode: 0o600 }); await rename(path + '.tmp', path);
      return project;
    };
    const pending = this.queue.then(operation); this.queue = pending.catch(() => {}); return pending;
  }
  async workspaceResource(workspaceId, resourceId) {
    identifier(resourceId, 'resourceId');
    const group = await this.workspace(workspaceId);
    const resource = group.resources.find(item => item.id === resourceId);
    if (!resource) throw new LakeError('资源不属于当前工作区或已删除', 404);
    return resource;
  }
  async createWorkspaceResource(workspaceId, data) {
    const group = await this.workspace(workspaceId);
    if (!group.project) throw new LakeError('请先启用资源区', 409);
    if (data.kind !== 'ssh') throw new LakeError('可新增 SSH 终端，本机终端由 Lake 内置');
    if (data.ssh && typeof data.ssh === 'object' && 'credentialRef' in data.ssh) throw new LakeError('请提供新连接的密码或私钥，不接受凭据引用');
    if (data.parentId && !group.resourceTree.some(node => node.id === data.parentId && node.kind === 'folder')) throw new LakeError('目标目录不属于当前工作区', 404);
    return this.call(`/projects/${group.project.id}/resources`, 'POST', data);
  }
  async editWorkspaceResource(workspaceId, resourceId, data) {
    const resource = await this.workspaceResource(workspaceId, resourceId);
    if (!['local', 'ssh'].includes(resource.kind)) throw new LakeError('当前仅支持编辑本机与 SSH 终端');
    // Credentials stay attached to their resource. Changes use explicit new
    // secret input; never accept another resource's saved credential reference.
    if (data.ssh !== undefined && (!data.ssh || typeof data.ssh !== 'object' || Array.isArray(data.ssh))) throw new LakeError('SSH 配置须为对象');
    if (data.ssh && ('credentialRef' in data.ssh || 'identityFile' in data.ssh)) throw new LakeError('更换密钥请上传私钥文件，不接受凭据引用');
    return this.call(`/resources/${resource.id}`, 'PATCH', data);
  }
  async deleteWorkspaceResource(workspaceId, resourceId) {
    const resource = await this.workspaceResource(workspaceId, resourceId);
    if (resource.kind === 'local') throw new LakeError('本机终端为内置入口，不能删除', 409);
    await this.call('/navigation-delete', 'POST', { kind: 'resource', id: resource.id });
    return { deleted: true };
  }
  async editWorkspaceTree(workspaceId, data) {
    const group = await this.workspace(workspaceId);
    if (!group.project) throw new LakeError('请先启用资源区', 409);
    if (!['create', 'rename', 'move', 'delete'].includes(data.operation)) throw new LakeError('不支持的目录操作');
    const nodes = group.resourceTree;
    const node = data.operation === 'create' ? null : nodes.find(item => item.id === identifier(data.nodeId, 'nodeId'));
    if (data.operation !== 'create' && !node) throw new LakeError('目录或资源不属于当前工作区', 404);
    if (['rename', 'delete'].includes(data.operation) && node.kind !== 'folder') throw new LakeError('此操作仅适用于目录');
    if (data.parentId && !nodes.some(item => item.id === data.parentId && item.kind === 'folder')) throw new LakeError('目标目录不属于当前工作区', 404);
    if (data.beforeId && !nodes.some(item => item.id === data.beforeId)) throw new LakeError('排序目标不属于当前工作区', 404);
    return this.call(`/projects/${group.project.id}/resource-tree`, 'POST', data);
  }
  async scope(dshSessionId, projectId) {
    identifier(dshSessionId, 'DSH session'); identifier(projectId, 'projectId');
    const operation = async () => {
      const file = join(this.runtime.config.home, 'dsh-terminal-scopes.json');
      await this.loadBindings();
      const key = dshSessionId + ':' + projectId;
      if (this.bindings[key]) return this.bindings[key];
      const execution = await this.call(`/projects/${projectId}/sessions`, 'POST', { title: `DSH execution ${dshSessionId.slice(0, 12)}` });
      this.bindings[key] = execution.id;
      await writeFile(file + '.tmp', JSON.stringify(this.bindings), { mode: 0o600 });
      await rename(file + '.tmp', file);
      return execution.id;
    };
    const pending = this.queue.then(operation);
    this.queue = pending.catch(() => {});
    return pending;
  }
  async loadBindings() {
    await this.runtime.ensure();
    if (this.bindings) return;
    if (!this.bindingLoad) this.bindingLoad = (async () => {
      try {
        const bindings = JSON.parse(await readFile(join(this.runtime.config.home, 'dsh-terminal-scopes.json'), 'utf8'));
        if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings) || Object.values(bindings).some(value => typeof value !== 'string' || !/^[\w-]{1,160}$/.test(value))) throw new Error('Invalid bindings');
        this.bindings = bindings;
      } catch (error) { if (error.code !== 'ENOENT') throw new LakeError('终端关联文件损坏，请检查插件数据目录', 500); this.bindings = {}; }
    })().finally(() => { this.bindingLoad = null; });
    await this.bindingLoad;
  }
  async terminal(dshSessionId, resourceId, interactive = true, signal) {
    const resource = await this.resource(resourceId, signal);
    if (!['local', 'ssh'].includes(resource.kind)) throw new LakeError('此资源不提供 Shell 终端');
    const scope = await this.scope(dshSessionId, resource.projectId);
    const terminal = await this.call(`/sessions/${scope}/terminals`, 'POST', { resourceId, interactive }, signal ?? AbortSignal.timeout(120000));
    return { terminal, projectId: resource.projectId };
  }
  async trust(dshSessionId, projectId, decision) {
    identifier(dshSessionId, 'DSH session');
    if (decision) {
      const scope = await this.scope(dshSessionId, projectId);
      return this.call(`/sessions/${scope}/host-key`, 'POST', decision);
    }
    // Poll only existing execution scopes. Merely opening a DSH chat must not
    // create Lake conversations or start an SSH connection.
    await this.queue;
    await this.loadBindings();
    for (const [key, scope] of Object.entries(this.bindings || {})) {
      if (!key.startsWith(dshSessionId + ':')) continue;
      const snapshot = await this.call(`/sessions/${scope}/snapshot`);
      if (snapshot.hostKeyTrust) return { projectId: key.slice(dshSessionId.length + 1), prompt: snapshot.hostKeyTrust };
    }
    return null;
  }
  async terminalCall(dshSessionId, projectId, terminalId, operation, data, signal) {
    identifier(terminalId, 'terminalId');
    if (!['history', 'input', 'resize', 'interrupt', 'disconnect', 'commands'].includes(operation)) throw new LakeError('Invalid terminal operation');
    const scope = await this.scope(dshSessionId, projectId);
    return this.call(`/sessions/${scope}/terminals/${terminalId}/${operation}`, data === undefined ? 'GET' : 'POST', data, signal);
  }
}
