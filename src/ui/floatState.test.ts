// 悬浮球状态持久化单测：位置存取、损坏容错、音效/震动开关
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadBallState, saveBallState, loadSfxEnabled, saveSfxEnabled,
  BALL_KEY, SFX_KEY, type KvStore
} from './floatState.ts';

function memStore(): KvStore {
  const m = new Map<string, string>();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
}

test('悬浮球位置保存后可读回', () => {
  const store = memStore();
  saveBallState({ x: 520, y: 610 }, store);
  assert.deepEqual(loadBallState(store), { x: 520, y: 610 });
  assert.ok(store.getItem(BALL_KEY)?.includes('520'), '应写入 JSON');
});

test('无存档时返回默认坐标(0,0)，由调用方套用默认位置', () => {
  const store = memStore();
  assert.deepEqual(loadBallState(store), { x: 0, y: 0 });
});

test('损坏的存档不抛错，回退默认', () => {
  const store = memStore();
  store.setItem(BALL_KEY, '{bad json!!');
  assert.deepEqual(loadBallState(store), { x: 0, y: 0 });
});

test('半损坏(缺字段)合并默认', () => {
  const store = memStore();
  store.setItem(BALL_KEY, '{"x": 300}');
  const s = loadBallState(store);
  assert.equal(s.x, 300);
  assert.equal(typeof s.y, 'number');
});

test('音效开关往返持久化', () => {
  const store = memStore();
  assert.equal(loadSfxEnabled(store), true, '默认开');
  saveSfxEnabled(false, store);
  assert.equal(loadSfxEnabled(store), false);
  assert.equal(store.getItem(SFX_KEY), 'off');
  saveSfxEnabled(true, store);
  assert.equal(loadSfxEnabled(store), true);
});
