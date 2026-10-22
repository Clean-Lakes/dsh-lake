import test from 'node:test';
import assert from 'node:assert/strict';
import {currentWorkspace} from '../client/src/state.js';
test('resource section follows DSH workspace membership before recency or default',()=>{
  const workspaces=[{workspaceId:'a',path:'/a',sessionIds:['one']},{workspaceId:'b',path:'/b',sessionIds:['two']}];
  const sessions={ids:['one','two'],byId:{one:{cwd:'/a'},two:{cwd:'/b'},child:{cwd:'/b'}}};
  assert.equal(currentWorkspace(workspaces,sessions,'two').workspaceId,'b');
  assert.equal(currentWorkspace(workspaces,sessions,'child').workspaceId,'b');
  assert.equal(currentWorkspace(workspaces,sessions,undefined).workspaceId,'a');
  assert.equal(currentWorkspace([],sessions,undefined),undefined);
});
