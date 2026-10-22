import { spawn } from 'node:child_process';
import { copyFile, mkdir, chmod, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySource } from './verify-source.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const lake = join(root, 'upstream/lake');
async function run(command, args, cwd = lake, extraEnv = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...extraEnv } });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} failed (${code})`)));
  });
}
await verifySource();
await run(process.execPath, ['scripts/build-client.mjs'], root);
await run('pnpm', ['--dir', 'web-agent', 'install', '--frozen-lockfile']);
await run('pnpm', ['--dir', 'web-agent', 'check']);
// Relative assets allow the unmodified workbench to live below DSH's prefix.
await run('pnpm', ['--dir', 'web-agent', 'exec', 'vite', 'build', '--config', 'web/vite.config.ts', '--base', './']);
if (process.platform === 'win32') {
  await rm(join(lake, 'assets/web/dist'), { recursive: true, force: true });
  await cp(join(lake, 'web-agent/web/dist'), join(lake, 'assets/web/dist'), { recursive: true });
  await mkdir(join(lake, 'bin'), { recursive: true });
  const version = (await readFile(join(lake, 'VERSION'), 'utf8')).trim();
  await run('go', ['build', '-trimpath', '-ldflags', `-X main.version=${version}`, '-o', 'bin/lake.exe', './cmd/lake'], lake, { CGO_ENABLED: '0' });
} else {
  await run('sh', ['scripts/build_lake.sh'], lake, { LAKE_REUSE_WEB_ASSETS: '1' });
}
const executable = process.platform === 'win32' ? 'lake.exe' : 'lake';
const dest = join(root, 'bin', `${process.platform}-${process.arch}`);
await mkdir(dest, { recursive: true });
await mkdir(join(root, 'dist'), { recursive: true });
await copyFile(join(lake, 'bin', executable), join(dest, executable));
await chmod(join(dest, executable), 0o755);
const source = JSON.parse(await readFile(join(root, 'upstream.lock.json'), 'utf8'));
await writeFile(join(dest, 'build.json'), JSON.stringify({ platform: process.platform, arch: process.arch, source, builtAt: new Date().toISOString() }, null, 2) + '\n');
console.log(`DSH Lake plugin built for ${process.platform}-${process.arch}`);
