import { homedir } from 'node:os';
import { resolve, join, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageRoot = fileURLToPath(new URL('../', import.meta.url));

export function resolveConfig(input = {}, env = process.env) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Lake config must be an object');
  const keys = new Set(['home', 'binaryPath', 'startupTimeoutMs']);
  for (const key of Object.keys(input)) if (!keys.has(key)) throw new Error(`Unknown Lake config: ${key}`);
  for (const key of ['home', 'binaryPath']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error(`${key} must be a path string`);
  }
  const home = resolve(input.home || join(env.DSH_HOME || join(homedir(), '.dsh'), 'storages', 'lake'));
  // Two live Lake processes must never share a database or credential directory.
  for (const protectedHome of [join(homedir(), '.lake'), join(homedir(), '.lake-dev')]) {
    const rel = relative(protectedHome, home);
    if (!rel || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))) throw new Error('Lake plugin home must be separate from .lake and .lake-dev');
  }
  const startupTimeoutMs = input.startupTimeoutMs ?? 30000;
  if (!Number.isInteger(startupTimeoutMs) || startupTimeoutMs < 1000 || startupTimeoutMs > 120000) throw new Error('startupTimeoutMs must be 1000..120000');
  const binaryPath = resolve(input.binaryPath || join(packageRoot, 'bin', `${process.platform}-${process.arch}`, process.platform === 'win32' ? 'lake.exe' : 'lake'));
  return { home, binaryPath, startupTimeoutMs };
}
