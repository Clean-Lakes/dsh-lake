import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LakeBackend } from '../lib/backend.js';
test('native bridge keeps bearer server-side and projects only resources', async t => {
  const server = http.createServer((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer private-backend-token'); assert.equal(req.headers.cookie, undefined);
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ projects: [], resources: [], resourceTree: [], sessions: [{ private: true }], models: [{ private: true }] }));
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const backend = new LakeBackend({ ensure: async()=>({origin:`http://127.0.0.1:${server.address().port}`, token:'private-backend-token'}) });
  assert.deepEqual(await backend.catalog(),{projects:[],resources:[],resourceTree:[]});
});
test('concurrent DSH terminal bindings are durable, distinct, and reused after restart', async t => {
  const home = await mkdtemp(join(tmpdir(),'dsh-lake-bindings-'));t.after(()=>rm(home,{recursive:true,force:true}));
  let scopes = 0; const runtime = {config:{home},ensure:async()=>({})};
  const backend = new LakeBackend(runtime);backend.call=async()=>({id:'scope-'+(++scopes)});
  const ids=await Promise.all([backend.scope('dsh-one','project'),backend.scope('dsh-one','project'),backend.scope('dsh-two','project')]);
  assert.deepEqual(ids,['scope-1','scope-1','scope-2']);assert.equal(scopes,2);
  const copy=new LakeBackend(runtime);copy.call=async()=>{throw new Error('must not create another scope');};
  assert.equal(await copy.scope('dsh-one','project'),'scope-1');
  assert.equal(Object.keys(JSON.parse(await readFile(join(home,'dsh-terminal-scopes.json')))).length,2);
  await assert.rejects(copy.scope('../outside','project'),/Invalid/);
});
test('workspace resources support idempotent enable, existing-project adoption and persistent separation', async t => {
  const home=await mkdtemp(join(tmpdir(),'dsh-lake-workspace-'));t.after(()=>rm(home,{recursive:true,force:true}));
  const runtime={config:{home},ensure:async()=>({})};let created=0;
  const projects=[{id:'old-project',name:'Existing resources'}], resources=[{id:'old-host',projectId:'old-project'}];
  const resourceTree=[{id:'folder',projectId:'old-project',kind:'folder',name:'Existing folder'},{id:'other-folder',projectId:'another-project',kind:'folder'}];
  function backend(){const value=new LakeBackend(runtime);value.call=async(path,_method,data)=>{if(path==='/catalog')return {projects,resources,resourceTree};if(path==='/projects'){const project={id:'project-'+(++created),name:data.name};projects.push(project);resources.push({id:'host-'+created,projectId:project.id});return project;}throw new Error(path);};return value;}
  const value=backend();assert.equal((await value.workspace('workspace-one')).project,null);
  const [one,same]=await Promise.all([value.bindWorkspace('workspace-one',{name:'One'}),value.bindWorkspace('workspace-one',{name:'One'})]);
  assert.equal(one.id,same.id);assert.equal(created,1);
  await value.bindWorkspace('workspace-two',{projectId:'old-project'});assert.equal(created,1);
  assert.deepEqual((await value.workspace('workspace-one')).resources.map(r=>r.id),['host-1']);
  assert.deepEqual((await backend().workspace('workspace-two')).resources.map(r=>r.id),['old-host']);
  assert.deepEqual((await backend().workspace('workspace-two')).resourceTree.map(r=>r.id),['folder']);
  assert.deepEqual((await value.workspace('workspace-one')).resourceTree,[]);
  await assert.rejects(value.bindWorkspace('workspace-one',{projectId:'old-project'}),/已有资源关联/);
});
