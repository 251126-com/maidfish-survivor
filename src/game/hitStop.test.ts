// 顿帧规格单测：大事件才有顿帧、里程碑弱于 Boss、未知事件抛错
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitStopSpec } from './hitStop.ts';

test('连杀里程碑顿帧：短促且不锁输入（ms < 200）', () => {
  const s = hitStopSpec('milestone');
  assert.ok(s.ms > 0 && s.ms < 200, `ms=${s.ms}`);
  assert.ok(s.scale > 0 && s.scale < 1);
});

test('Boss 击破顿帧强于连杀里程碑', () => {
  const m = hitStopSpec('milestone');
  const b = hitStopSpec('boss');
  assert.ok(b.ms > m.ms);
  assert.ok(b.scale < m.scale);
});

test('未知顿帧事件抛错（防止漏配反馈）', () => {
  assert.throws(() => hitStopSpec('nope' as never), /未知顿帧事件/);
});
