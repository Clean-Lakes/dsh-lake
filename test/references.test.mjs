import test from 'node:test';
import assert from 'node:assert/strict';
import {resourceReference,resourceSource,resourceTextRule} from '../client/src/references.js';
const context={workspaces:{list:{getSnapshot:()=>({items:[{workspaceId:'workspace-a',title:'A',path:'/a',sessionIds:['session-a']},{workspaceId:'workspace-b',title:'B',path:'/b',sessionIds:['session-b']}]})}},sessions:{list:{getSnapshot:()=>({byId:{'session-a':{cwd:'/a'},'session-b':{cwd:'/b'}}})}}};
test('@ source is workspace-aware and produces native reference chips with stable ids',async()=>{
  const requests=[];
  const source=resourceSource(context,()=>{},async path=>{requests.push(path);return {resources:[{id:'host',name:'web-01',kind:'ssh',ssh:{host:'127.0.0.1'}}]};});
  const candidates=await source.candidates({sessionId:'session-b'},{query:'web',signal:new AbortController().signal});
  assert.equal(requests[0],'/workspaces/workspace-b/resources');
  const {insert}=source.onPick({candidate:candidates[0]});assert.equal(insert.label,'web-01');assert.equal(insert.ref,'workspace-b/host');assert.equal(insert.source,'lake-resource');
  assert.deepEqual(await source.candidates({sessionId:'missing'},{query:'',signal:new AbortController().signal}),[]);
});
test('reference serialization resolves fresh metadata, excludes credentials and refuses stale ids',async()=>{
  let present=true;
  const source=resourceSource(context,()=>{},async()=>({resources:present?[{id:'host',name:'renamed',kind:'ssh',ssh:{host:'127.0.0.1',password:'fixture-secret',credentialRef:'private-path'}}]:[]}));
  const text=await source.codec.serialize('workspace-a/host');assert.match(text,/renamed/);assert.match(text,/workspace-a/);assert.doesNotMatch(text,/fixture-secret|private-path|credentialRef|password/);
  present=false;await assert.rejects(source.codec.serialize('workspace-a/host'),/已移除/);
  assert.throws(()=>resourceReference({id:'../outside',name:'bad'},'workspace-a'),/引用无效/);
});

test('message display recognizes native serialized resource tags without altering raw text',async()=>{
  const source=resourceSource(context,()=>{},async()=>({resources:[{id:'host',name:'web-01',kind:'local'}]}));
  const text='检查'+await source.codec.serialize('workspace-a/host')+'是否正常';
  const node=resourceTextRule.match(text,0);assert.equal(node.id,'lake-resource');assert.equal(node.data.name,'web-01');assert.equal(text.slice(0,node.start),'检查');assert.equal(text.slice(node.end),'是否正常');
  assert.equal(resourceTextRule.match('ordinary user message',0),undefined);
});
test('trimmed persisted messages still render the resource at the document end',async()=>{
  const source=resourceSource(context,()=>{},async()=>({resources:[{id:'host',name:'web-01',kind:'local'}]}));
  const text=('检查'+await source.codec.serialize('workspace-a/host')).trim();
  const node=resourceTextRule.match(text,0);assert.equal(node.data.resourceId,'host');assert.equal(node.end,text.length);
});
test('leading and standalone resource tags survive DSH message trimming',async()=>{
  const source=resourceSource(context,()=>{},async()=>({resources:[{id:'host',name:'Local machine',kind:'local'}]}));
  const serialized=await source.codec.serialize('workspace-a/host');
  for(const suffix of ['状态如何','']){
    const text=(serialized+suffix).trim();
    const node=resourceTextRule.match(text,0);
    assert.ok(node,'a tag at the start of a persisted message must render');
    assert.equal(node.start,0);assert.equal(node.data.name,'Local machine');assert.equal(text.slice(node.end),suffix);
  }
});
test('resource matching respects line boundaries and handles consecutive tags and malformed metadata',()=>{
  const tag='[Lake resource]\n'+JSON.stringify({workspaceId:'workspace-a',resourceId:'host',name:'Local machine',kind:'local'});
  const text=tag+'\n'+tag+'\n状态如何';
  const first=resourceTextRule.match(text,0),second=resourceTextRule.match(text,first?.end);
  assert.ok(first);assert.ok(second);assert.ok(second.start>=first.end);assert.equal(text.slice(second.end),'状态如何');
  assert.equal(resourceTextRule.match('literal '+tag,0),undefined);
  assert.equal(resourceTextRule.match(tag,1),undefined);
  assert.equal(resourceTextRule.match('[Lake resource]\nnot-json\n'+tag,0).data.resourceId,'host');
});
