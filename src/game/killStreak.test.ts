// 连杀系统单测：窗口期连续累计、断档清零、里程碑判定
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KillStreak, streakHeat } from './killStreak.ts';

test('窗口期内连续击杀递增连杀数', () => {
  const s = new KillStreak(3.0);
  assert.equal(s.add(), 1);
  assert.equal(s.add(), 2);
  assert.equal(s.add(), 3);
  assert.equal(s.current, 3);
});

test('窗口耗尽后 tick 清零连杀（断档重置）', () => {
  const s = new KillStreak(3.0);
  s.add(); s.add();
  s.tick(2.9);
  assert.equal(s.current, 2, '窗口未耗尽前保留');
  s.tick(0.2);
  assert.equal(s.current, 0, '窗口耗尽清零');
  assert.equal(s.timeLeft, 0);
});

test('窗口内每次 add 都会刷新剩余时间', () => {
  const s = new KillStreak(2.0);
  s.add();
  s.tick(1.5);
  assert.equal(s.timeLeft > 0.4, true);
  s.add();   // 刷新窗口
  assert.ok(s.timeLeft >= 1.9, `add 后应刷新窗口，实际 ${s.timeLeft}`);
  s.tick(1.5);
  assert.equal(s.current, 2, '刷新后仍在窗口内');
});

test('里程碑：仅在达到 n 的倍数时为 true', () => {
  const s = new KillStreak(3.0);
  s.add(); s.add();
  assert.equal(s.isMilestone(5), false);
  s.add(); s.add(); s.add();
  assert.equal(s.current, 5);
  assert.equal(s.isMilestone(5), true);
  assert.equal(s.isMilestone(3), false);
});

test('连杀数为 0 时不触发里程碑', () => {
  const s = new KillStreak(3.0);
  assert.equal(s.isMilestone(5), false);
});

// v0.13.0 连杀热度映射单测
test('连杀热度：0 连杀为 0、单调递增、15 连杀封顶 1', () => {
  assert.equal(streakHeat(0), 0);
  assert.ok(streakHeat(5) > streakHeat(1));
  assert.equal(streakHeat(15), 1);
  assert.equal(streakHeat(99), 1, '超过 15 连杀应封顶');
  assert.ok(streakHeat(10) <= 1 && streakHeat(10) > 0);
});
