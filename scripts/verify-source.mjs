import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export async function verifySource() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const files = JSON.parse(await readFile(join(root, 'upstream.files.json'), 'utf8'));
  for (const [path, expected] of Object.entries(files)) {
    const data = await readFile(join(root, 'upstream/lake', path));
    const actual = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
    if (actual !== expected) throw new Error(`Upstream source changed: ${path}`);
  }
  console.log(`Lake develop: ${Object.keys(files).length} source files match the pinned Git blobs`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await verifySource();
