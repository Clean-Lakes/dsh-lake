import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  absWorkingDir: root, entryPoints: ['client/src/index.jsx'], outfile: 'client/client.js',
  bundle: true, format: 'cjs', platform: 'browser', target: 'es2022', external: ['react'],
  loader: { '.css': 'text' },
  banner: { js: 'window.__ModuleLoader__.load({id:"@clean-lakes/dsh-lake",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
  footer: { js: 'return module.exports;}});' },
});
const hashes = {};
for (const file of ['client/src/index.jsx', 'client/src/components.jsx', 'client/src/api.js', 'client/src/state.js', 'client/src/references.js', 'client/src/resource-tree.js', 'client/src/management.jsx', 'client/src/styles.css', 'scripts/build-client.mjs', 'client/client.js']) hashes[file] = createHash('sha256').update(await readFile(join(root, file))).digest('hex');
await writeFile(join(root, 'client/build.json'), JSON.stringify({ hostSDK: '0.2.1-rc.2', hashes }, null, 2) + '\n');
console.log('Built DSH-native Lake client');
