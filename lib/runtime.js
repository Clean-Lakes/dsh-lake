import { spawn } from 'node:child_process';
import { access, mkdir, open, readFile, rm, realpath, chmod } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, relative, isAbsolute, sep } from 'node:path';
import { homedir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

export class LakeRuntime {
  constructor(config) {
    this.config = config;
    this.child = null;
    this.session = null;
    this.pending = null;
    this.disposed = false;
    this.locked = false;
  }

  status() {
    return { state: this.disposed ? 'stopped' : this.session ? 'ready' : this.pending ? 'starting' : 'idle' };
  }

  async ensure() {
    if (this.disposed) throw new Error('Lake plugin has stopped');
    if (this.session) return this.session;
    if (!this.pending) this.pending = this.start().finally(() => { this.pending = null; });
    return this.pending;
  }

  async acquire() {
    const { home } = this.config;
    await mkdir(home, { recursive: true, mode: 0o700 });
    const canonical = await realpath(home);
    for (const name of ['.lake', '.lake-dev']) {
      const protectedPath = await realpath(join(homedir(), name)).catch(() => join(homedir(), name));
      const rel = relative(protectedPath, canonical);
      if (!rel || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))) throw new Error('Lake plugin home resolves to a protected Lake directory');
    }
    await chmod(home, 0o700);
    this.lockPath = join(home, '.dsh-lake.lock');
    try {
      await mkdir(this.lockPath, { mode: 0o700 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = await readFile(join(this.lockPath, 'owner.json'), 'utf8').then(JSON.parse).catch(() => null);
      if (!owner || alive(owner.ownerPid) || alive(owner.childPid)) throw new Error('Lake plugin data directory is already in use (or has an incomplete lock)');
      await rm(this.lockPath, { recursive: true });
      await mkdir(this.lockPath, { mode: 0o700 });
    }
    this.locked = true;
    await this.writeOwner();
  }

  async writeOwner() {
    const file = await open(join(this.lockPath, 'owner.json'), 'w', 0o600);
    try { await file.writeFile(JSON.stringify({ ownerPid: process.pid, childPid: this.child?.pid ?? null })); }
    finally { await file.close(); }
  }

  async start() {
    const { home, binaryPath, startupTimeoutMs } = this.config;
    try {
      if (this.child) { await this.stopChild(); await this.release(); }
      await access(binaryPath, process.platform === 'win32' ? constants.F_OK : constants.X_OK).catch(() => {
        throw new Error(`Lake executable is missing for ${process.platform}-${process.arch}; run npm run build on this platform`);
      });
      await this.acquire();
      if (this.disposed) throw new Error('Lake plugin has stopped');
      // Do not inherit a running Lake's home, token, dev origin, or auto-open flags.
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('LAKE_')));
      env.LAKE_HOME = home;
      env.LAKE_WEB_DATA_DIR = join(home, 'web-agent');
      const child = spawn(binaryPath, ['web', '--home', home, '--port', '0'], {
        cwd: home, env, stdio: 'ignore', windowsHide: true,
      });
      this.child = child;
      this.exitPromise = new Promise(resolve => {
        child.once('error', () => resolve());
        child.once('exit', () => { this.session = null; resolve(); });
      });
      await this.writeOwner();
      const deadline = Date.now() + startupTimeoutMs;
      while (Date.now() < deadline && !this.disposed) {
        if (child.exitCode !== null || child.signalCode !== null || !child.pid) throw new Error('Lake backend exited during startup');
        const runtime = await readFile(join(home, 'web-agent', 'runtime.json'), 'utf8').then(JSON.parse).catch(() => null);
        if (runtime?.pid === child.pid && typeof runtime.token === 'string' && runtime.token.length >= 32) {
          const origin = new URL(runtime.origin);
          if (origin.protocol !== 'http:' || origin.hostname !== 'localhost' || !origin.port || origin.pathname !== '/' || origin.username || origin.password) throw new Error('Invalid Lake runtime endpoint');
          // Read the private runtime file; never put its bearer in HTML, logs, or a browser URL.
          const session = { origin: `http://127.0.0.1:${origin.port}`, token: runtime.token };
          const response = await fetch(`${session.origin}/api/bootstrap`, {
            headers: { Authorization: `Bearer ${session.token}` }, signal: AbortSignal.timeout(1000),
          }).catch(() => null);
          if (response?.ok) { this.session = session; return session; }
        }
        await delay(50);
      }
      throw new Error(this.disposed ? 'Lake plugin has stopped' : 'Lake backend startup timed out');
    } catch (error) {
      await this.stopChild();
      await this.release();
      throw error;
    }
  }

  async stopChild() {
    const child = this.child;
    if (!child) return;
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([this.exitPromise, delay(5000, undefined, { ref: false })]);
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await this.exitPromise; }
    }
    this.child = null;
    this.session = null;
  }

  async release() {
    if (this.locked) { await rm(this.lockPath, { recursive: true, force: true }); this.locked = false; }
  }

  async dispose() {
    this.disposed = true;
    if (this.pending) await this.pending.catch(() => {});
    await this.stopChild();
    await this.release();
  }
}
