// 加载阶段状态机单测：进度单调、状态迁移、失败兜底、超时提示
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reportProgress, reportError, shouldShowFallback } from './loadState.ts';

test('初始状态为 booting，进度 0，无错误', () => {
  const s = initialState();
  assert.equal(s.phase, 'booting');
  assert.equal(s.progress, 0);
  assert.deepEqual(s.errorKeys, []);
});

test('进度上报进入 loading，进度被钳制在 0..1', () => {
  let s = reportProgress(initialState(), 0.5);
  assert.equal(s.phase, 'loading');
  assert.equal(s.progress, 0.5);
  s = reportProgress(s, -1);
  assert.equal(s.progress, 0);
  s = reportProgress(s, 1.5);
  assert.equal(s.progress, 1);
});

test('进度到 1 进入 ready（资源加载完成即可进菜单）', () => {
  const s = reportProgress(initialState(), 1);
  assert.equal(s.phase, 'ready');
});

test('出现加载错误进入 error，且错误 key 去重累积', () => {
  let s = reportError(initialState(), 'bg_moon');
  assert.equal(s.phase, 'error');
  s = reportError(s, 'bg_moon');
  s = reportError(s, 'player_whale');
  assert.deepEqual(s.errorKeys, ['bg_moon', 'player_whale']);
});

test('error 后继续上报进度仍保持 error（不掩盖失败）', () => {
  const s = reportProgress(reportError(initialState(), 'bg_moon'), 1);
  assert.equal(s.phase, 'error');
});

test('超时兜底：未 ready 且超时才提示；ready 后永不提示', () => {
  const s = reportProgress(initialState(), 0.3);
  assert.equal(shouldShowFallback(s, 10000), false);
  assert.equal(shouldShowFallback(s, 21000), true);
  const ready = reportProgress(s, 1);
  assert.equal(shouldShowFallback(ready, 60000), false);
});
