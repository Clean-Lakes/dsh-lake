import test from 'node:test';
import assert from 'node:assert/strict';
import { admitted } from '../lib/proxy.js';

function request(headers = {}, remoteAddress = '127.0.0.1') {
  return { headers: { host: 'localhost:3000', ...headers }, socket: { remoteAddress } };
}
test('request gate enforces DSH login before the backend bearer is added', () => {
  assert.equal(admitted({ get: () => ({ requestRejection: () => 401 }) }, request()), 401);
  assert.equal(admitted({}, request({ host: 'evil.example' })), 403);
  assert.equal(admitted({}, request({ origin: 'https://evil.example' })), 403);
  assert.equal(admitted({}, request({ origin: 'http://localhost:3001' })), 403);
  assert.equal(admitted({}, request({ 'sec-fetch-site': 'cross-site' })), 403);
  assert.equal(admitted({}, request({}, '192.168.1.2')), 403);
  assert.equal(admitted({}, request({ origin: 'http://localhost:3000' })), 0);
  // Official Desktop strips Host/Origin, but supplies its signed host cookie.
  assert.equal(admitted({ get: () => ({ requestRejection: () => undefined }) }, request({ host: undefined })), 0);
});
