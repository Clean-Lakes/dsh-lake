import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceResources } from '../client/src/api.js';

test('workspace tree loading supports live older backends without exposing another project tree',async()=>{
  const signal=new AbortController().signal,requests=[];
  const legacy={project:{id:'project-a'},resources:[{id:'host'}]};
  const loaded=await workspaceResources('workspace-a',signal,async(path,method,_body,passedSignal)=>{
    requests.push(path);assert.equal(method,'GET');assert.equal(passedSignal,signal);
    return path==='/catalog'?{resourceTree:[{id:'folder-a',projectId:'project-a'},{id:'folder-b',projectId:'project-b'}]}:legacy;
  });
  assert.deepEqual(requests,['/workspaces/workspace-a/resources','/catalog']);
  assert.deepEqual(loaded.resourceTree.map(node=>node.id),['folder-a']);
  for(const data of [{project:{id:'project-a'},resourceTree:[]},{project:null,resources:[]}]){
    let calls=0;
    assert.equal(await workspaceResources('workspace-a',signal,async()=>{calls++;return data;}),data);
    assert.equal(calls,1);
  }
});
