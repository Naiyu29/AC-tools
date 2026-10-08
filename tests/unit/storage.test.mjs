import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRIDGE_KEY, lsGetJSON, lsSetJSON, lsRemove, isValidBridgePayload, writeBridge, readBridge, clearBridge, parseShareHash } from '../../docs/shared/storage.js';

function fakeStorage(failOnSet = false) {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (failOnSet) throw new Error('QuotaExceeded'); m.set(k, String(v)); },
    removeItem: k => m.delete(k),
    _m: m,
  };
}

test('lsGetJSON / lsSetJSON / lsRemove 基本流程與錯誤容忍', () => {
  const st = fakeStorage();
  assert.equal(lsGetJSON('k', 'fb', st), 'fb');
  assert.equal(lsSetJSON('k', { a: 1 }, st), true);
  assert.deepEqual(lsGetJSON('k', null, st), { a: 1 });
  st._m.set('bad', '{not json');
  assert.equal(lsGetJSON('bad', 'fb', st), 'fb');
  lsRemove('k', st);
  assert.equal(lsGetJSON('k', null, st), null);
  assert.equal(lsSetJSON('k', 1, fakeStorage(true)), false);
  assert.equal(lsSetJSON('k', 1, undefined), false);
  assert.equal(lsGetJSON('k', 'fb', undefined), 'fb');
});

test('橋接資料：寫入、讀取、無效自動清除', () => {
  const st = fakeStorage();
  const payload = { stations: [0, 10], elevations: [1, 2], offset: 0, layer: '刨除後' };
  assert.ok(isValidBridgePayload(payload));
  assert.ok(!isValidBridgePayload({ stations: [0], elevations: [1] }));
  assert.ok(!isValidBridgePayload({ stations: [0, 1], elevations: [1] }));
  assert.ok(writeBridge(payload, st));
  assert.deepEqual(readBridge(st), payload);
  clearBridge(st);
  assert.equal(readBridge(st), null);
  st._m.set(BRIDGE_KEY, JSON.stringify({ stations: [1] }));
  assert.equal(readBridge(st), null);
  assert.equal(st._m.has(BRIDGE_KEY), false);
});

test('parseShareHash', () => {
  assert.deepEqual(parseShareHash('#s=abc'), { kind: 'share', id: 'abc' });
  assert.deepEqual(parseShareHash('s=abc'), { kind: 'share', id: 'abc' });
  assert.deepEqual(parseShareHash('#data=eyJ9'), { kind: 'legacy', data: 'eyJ9' });
  assert.deepEqual(parseShareHash('#state=xxx'), { kind: 'obsolete' });
  assert.equal(parseShareHash(''), null);
  assert.equal(parseShareHash(undefined), null);
});
