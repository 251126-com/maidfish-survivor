// 顿帧规格单测：大事件才有顿帧、里程碑弱于 Boss、未知事件抛错
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitStopSpec } from './hitStop.ts';

test('连杀里程碑顿帧：短促且不锁输入（ms < 200）', () => {
  const s = hitStopSpec('milestone');
  assert.ok(s.ms > 0 && s.ms < 200, `ms=${s.ms}`);
  assert.ok(s.scale > 0 && s.scale < 1);
});

test('v0.13.0: 精英击杀顿帧约 0.05s、短于连杀里程碑', () => {
  const e = hitStopSpec('elite');
  assert.ok(e.ms >= 40 && e.ms <= 70, `精英顿帧应在 0.04~0.07s，实际 ${e.ms}ms`);
  assert.ok(e.scale > 0 && e.scale < 1);
  const m = hitStopSpec('milestone');
  assert.ok(e.ms < m.ms, '精英顿帧应短于连杀里程碑');
  assert.ok(e.scale > m.scale, '精英顿帧时间缩放应比里程碑轻（更接近 1）');
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
