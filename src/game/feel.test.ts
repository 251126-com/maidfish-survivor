// 游戏反馈策略单测：反馈强度分档，常规事件不触发抖动
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shakeForEvent } from './feel.ts';

test('受击事件返回有效抖动规格（时长>0 且强度>0）', () => {
  const s = shakeForEvent('hurt');
  assert.ok(s.duration > 0);
  assert.ok(s.intensity > 0);
});

test('Boss 事件强度高于受击（重要性分档）', () => {
  const hurt = shakeForEvent('hurt');
  const boss = shakeForEvent('boss');
  assert.ok(boss.intensity > hurt.intensity);
  assert.ok(boss.duration >= hurt.duration);
});

test('未知事件抛出错误而非静默返回（防止漏配反馈）', () => {
  assert.throws(() => shakeForEvent('nope' as never), /未知反馈事件/);
});
