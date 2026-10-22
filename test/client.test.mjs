import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

test('workspace integration contributes additive seats without taking over DSH navigation or conversations', async () => {
  let plugin;
  const sandbox = { console, setTimeout, clearTimeout, navigator: { platform: 'MacIntel', userAgent: 'test' }, document: { createElement: () => ({ dataset: {}, remove() {} }), head: { append() {} } } };
  sandbox.self = sandbox;
  sandbox.window = { __ModuleLoader__: { load: ({ id, factory }) => {
    assert.equal(id, '@clean-lakes/dsh-lake');
    plugin = factory(name => { assert.equal(name, 'react'); return { createElement() {} }; });
  } } };
  vm.runInNewContext(await readFile(new URL('../client/client.js', import.meta.url), 'utf8'), sandbox);
  const slots = [];
  plugin.apply({ inputTriggers: {registerSource:()=>()=>{}}, uiConversation:{userText:{register:()=>()=>{}}}, effect: callback => callback(), slots: { inject: (_, callback) => callback(), entriesOfSlot: () => [], register: (meta, render) => { slots.push({ meta, render }); return () => {}; } } });
  for (const name of ['sidebar.footer.action','conversation.input.left','shell.overlay','shell.bottom']) assert.ok(slots.some(({meta})=>meta.name===name), name);
  assert.ok(!slots.some(({meta})=>['main','sidebar','sidebar.workspaces','sidebar.panellist'].includes(meta.name)));
  const messageTag = slots.find(({meta})=>meta.name==='conversation.user.text.node');
  assert.doesNotThrow(()=>messageTag.render({node:{data:{name:'host',kind:'local'}}}));
  const occupiedSlots=[];
  plugin.apply({inputTriggers:{registerSource:()=>()=>{}},uiConversation:{userText:{register:()=>()=>{}}},effect:callback=>callback(),slots:{inject:(_,callback)=>callback(),entriesOfSlot:()=>[{}],register:(meta)=>{occupiedSlots.push(meta);return()=>{};}}});
  assert.ok(!occupiedSlots.some(meta=>meta.name==='shell.bottom'));
  assert.ok(occupiedSlots.some(meta=>meta.name==='shell.overlay'&&meta.id==='lake.terminal'));
  const source = await readFile(new URL('../client/src/index.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /<iframe|renderFactorySlot|SessionProvider|\/settings\/model/);
});
