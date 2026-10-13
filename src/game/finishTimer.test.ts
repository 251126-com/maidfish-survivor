// finishTimer 回归测试（v0.9.1 根因修复）
// 背景：Phaser Clock.delayedCall 由游戏时钟驱动，fps.min=30+smoothStep 在低帧率/共享CPU环境
//       把每帧游戏 delta 钳到 ≤33ms，1100ms 游戏延迟需数倍真实时间（实测 headless ≈6.1s 且随负载恶化）
//       → 改为墙钟推进、暂停/面板冻结、只触发一次的纯逻辑计时器。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFinishTimer, RESULT_DELAY_MS } from './finishTimer.ts';

test('正常 1.1s 展示后触发一次（墙钟推进，抗低帧率）', () => {
  const t = createFinishTimer(RESULT_DELAY_MS);
  assert.equal(t.started, false);
  t.start();
  assert.equal(t.started, true);
  assert.equal(t.fired, false);
  // 低帧率模拟：每帧真实间隔 90ms（≈11fps，比游戏时钟 30fps 下限更糟），仍应在 ~1.1s 墙钟触发
  let now = 0;
  let firedAt = -1;
  let firedCount = 0;
  for (let i = 0; i < 40; i++) {
    now += 90;
    if (t.tick(now, false)) { firedAt = now; firedCount++; }
  }
  assert.equal(firedCount, 1, '只触发一次');
  assert.ok(firedAt >= RESULT_DELAY_MS && firedAt < RESULT_DELAY_MS + 90, `约 1.1s 墙钟触发（实际 ${firedAt}ms）`);
  assert.equal(t.fired, true);
});

test('暂停/升级面板期间冻结：不计时，解除后继续', () => {
  const t = createFinishTimer(RESULT_DELAY_MS);
  t.start();
  t.tick(0, false);          // 首帧建立基准
  t.tick(300, false);        // 正常推进 300ms
  assert.equal(t.shownMs, 300);
  t.tick(600, true);         // 暂停：300ms 不计
  assert.equal(t.shownMs, 300);
  t.tick(900, true);         // 继续暂停
  assert.equal(t.shownMs, 300);
  t.tick(1500, false);       // 解除暂停：只计 600ms → 累计 900ms，未触发
  assert.equal(t.shownMs, 900);
  assert.equal(t.fired, false);
  t.tick(1700, false);       // 再 200ms → 累计 1100ms → 触发
  assert.equal(t.fired, true);
  assert.equal(t.shownMs, RESULT_DELAY_MS);
});

test('暂停期间的时长不会在解除后补计', () => {
  const t = createFinishTimer(RESULT_DELAY_MS);
  t.start();
  t.tick(0, false);
  t.tick(100, false);        // 推进 100
  t.tick(1000, true);        // 暂停 900ms
  t.tick(2000, false);       // 解除：只算 2000-1000=1000ms → 累计 1100 → 触发
  assert.equal(t.fired, true, '暂停时长不应被计入展示时间');
});

test('二次 start（重复 finish）不重置已累计展示时间', () => {
  const t = createFinishTimer(RESULT_DELAY_MS);
  t.start();
  t.tick(0, false);
  t.tick(500, false);
  t.start();                 // 重复 finish（场景层 isOver 守卫之外的双保险）
  assert.equal(t.shownMs, 500, '不应重置');
  t.tick(1100, false);       // 600ms 后累计 1100 → 触发
  assert.equal(t.fired, true);
});

test('shutdown/reset 幂等：重置后可重新开始新一局', () => {
  const t = createFinishTimer(RESULT_DELAY_MS);
  t.start();
  t.tick(0, false);
  t.tick(1500, false);
  assert.equal(t.fired, true);
  t.reset();
  assert.equal(t.started, false);
  assert.equal(t.fired, false);
  assert.equal(t.shownMs, 0);
  t.reset();                 // 幂等：重复 reset 不抛错
  t.start();
  t.tick(0, false);
  t.tick(RESULT_DELAY_MS, false);
  assert.equal(t.fired, true, '新一局可再次触发');
});

test('未 start 时 tick 不触发', () => {
  const t = createFinishTimer(RESULT_DELAY_MS);
  assert.equal(t.tick(100, false), false);
  assert.equal(t.fired, false);
  assert.equal(t.shownMs, 0);
});

test('墙钟回退防御：now 未前进时不累计、不破坏状态', () => {
  const t = createFinishTimer(RESULT_DELAY_MS);
  t.start();
  t.tick(1000, false);
  t.tick(500, false);        // 回退帧（理论不应发生，防御）
  assert.equal(t.shownMs, 0, '回退帧不计入');
  t.tick(2100, false);       // 之后正常推进到 1100 → 触发
  assert.equal(t.fired, true);
});
