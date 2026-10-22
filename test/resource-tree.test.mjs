import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceTree, folderOptions } from '../client/src/resource-tree.js';
const resources = [{id:'host',name:'web-01',kind:'ssh',ssh:{host:'192.0.2.1'}},{id:'db',name:'orders',kind:'database',settings:{host:'192.0.2.2'}},{id:'local',name:'Local machine',kind:'local'},{id:'unfiled',name:'unfiled',kind:'ssh'}];
const navigation = [{id:'servers',kind:'folder',name:'服务器',position:1},{id:'databases',kind:'folder',name:'数据库',parentId:'servers',position:1},{id:'host-node',kind:'resource',resourceId:'host',parentId:'servers',position:0},{id:'db-node',kind:'resource',resourceId:'db',parentId:'databases',position:0}];
function ids(nodes) {return nodes.flatMap(node=>node.type==='folder'?ids(node.children):[node.resource.id]);}
test('resource navigation preserves nested folders, ordering, counts and unfiled resources',()=>{
  const tree=resourceTree(resources,navigation);
  assert.equal(tree[0].id,'local');assert.equal(tree[1].name,'服务器');assert.equal(tree[1].count,2);
  assert.equal(tree[1].children[0].id,'host');assert.equal(tree[1].children[1].name,'数据库');
  assert.deepEqual(ids(tree),['local','host','db','unfiled']);
});
test('search reveals matching resources with ancestor paths and matches whole folder subtrees',()=>{
  const byHost=resourceTree(resources,navigation,'192.0.2.2');
  assert.equal(byHost[0].name,'服务器');assert.equal(byHost[0].children[0].name,'数据库');assert.deepEqual(ids(byHost),['db']);
  assert.deepEqual(ids(resourceTree(resources,navigation,'服务器')),['host','db']);
  assert.deepEqual(resourceTree(resources,navigation,'no-match'),[]);
});
test('missing nodes and malformed parent cycles cannot hide or duplicate live resources',()=>{
  const tree=resourceTree(resources,[...navigation,{id:'servers',kind:'folder',name:'duplicate'},{id:'loop',kind:'folder',name:'cycle',parentId:'loop',position:0},{id:'ghost',kind:'resource',resourceId:'deleted',parentId:'servers',position:0},{id:'host-copy',kind:'resource',resourceId:'host',position:0}]);
  assert.deepEqual(ids(tree).sort(),resources.map(r=>r.id).sort());
  const cyclic=resourceTree(resources,[{id:'a',kind:'folder',name:'a',parentId:'b'},{id:'b',kind:'folder',name:'b',parentId:'a'},{id:'host-node',kind:'resource',resourceId:'host',parentId:'a'}]);
  assert.deepEqual(ids(cyclic).sort(),resources.map(r=>r.id).sort());
});
test('move targets include full folder paths and exclude the moving folder and descendants',()=>{
  assert.deepEqual(folderOptions(navigation).map(item=>item.label),['资源根目录','服务器','服务器 / 数据库']);
  assert.deepEqual(folderOptions(navigation,'servers'),[{id:'',label:'资源根目录'}]);
  assert.deepEqual(folderOptions(navigation,'databases').map(item=>item.id),['','servers']);
});
