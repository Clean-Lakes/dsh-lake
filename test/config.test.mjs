import test from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveConfig } from '../lib/config.js';

test('plugin uses a private DSH data directory', () => {
  assert.equal(resolveConfig({}, { DSH_HOME: '/tmp/example-dsh' }).home, '/tmp/example-dsh/storages/lake');
});
test('production and Dev homes and descendants are refused', () => {
  for (const name of ['.lake', '.lake-dev']) {
    assert.throws(() => resolveConfig({ home: join(homedir(), name) }), /separate/);
    assert.throws(() => resolveConfig({ home: join(homedir(), name, 'nested') }), /separate/);
    assert.throws(() => resolveConfig({ home: join(homedir(), name, '..hidden') }), /separate/);
  }
});
test('invalid config fails explicitly', () => {
  for (const config of [{ typo: true }, { home: 4 }, { startupTimeoutMs: 0 }, { startupTimeoutMs: '30000' }, []]) assert.throws(() => resolveConfig(config));
});
