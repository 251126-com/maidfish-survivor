// 背景系统纯逻辑单测
// 契约：四张授权背景按 60s 周期循环，开局 3 分钟内全部可达；任意起始下标下
//       activeBgIndex/activeBgAt 一致；nextBgIndex 循环前进；边界正确。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BG_ORDER, BG_SWITCH_SEC, BG_CYCLE_SEC, BG_FADE, activeBgAt, activeBgIndex, nextBgIndex, randomStartIndex, manualHoldUntil } from './background.ts';
import { GAME_DURATION } from './balance.ts';

test('恰好四张授权背景，键与名非空且唯一', () => {
  assert.equal(BG_ORDER.length, 4, '必须正好四张授权背景');
  const keys = BG_ORDER.map(p => p.key);
  assert.equal(new Set(keys).size, 4, '键必须唯一');
  const names = BG_ORDER.map(p => p.name);
  assert.equal(new Set(names).size, 4, '名称必须唯一');
  for (const p of BG_ORDER) {
    assert.ok(p.key.length > 0 && p.name.length > 0);
  }
});

test('单局时长内四张全部可达：startIndex=0 时 0/60/120/180s 各到一张', () => {
  const seenKeys = new Set<string>();
  for (let sec = 0; sec < GAME_DURATION; sec += BG_SWITCH_SEC) {
    seenKeys.add(activeBgAt(sec).key);
  }
  assert.equal(seenKeys.size, 4, '一局内必须见过全部四张');
});

test('activeBgIndex 边界与周期：0/60/120/180/240 正确滚动', () => {
  // startIndex=0
  assert.equal(activeBgAt(0).key, BG_ORDER[0].key);
  assert.equal(activeBgAt(59.99).key, BG_ORDER[0].key);
  assert.equal(activeBgAt(60).key, BG_ORDER[1].key);
  assert.equal(activeBgAt(119.99).key, BG_ORDER[1].key);
  assert.equal(activeBgAt(120).key, BG_ORDER[2].key);
  assert.equal(activeBgAt(179.99).key, BG_ORDER[2].key);
  assert.equal(activeBgAt(180).key, BG_ORDER[3].key);
  assert.equal(activeBgAt(239.99).key, BG_ORDER[3].key);
  // 满一轮回到第一张
  assert.equal(activeBgAt(BG_CYCLE_SEC).key, BG_ORDER[0].key);
});

test('任意起始下标：index 语义正确且每 60s 前进一格', () => {
  for (let start = 0; start < BG_ORDER.length; start++) {
    assert.equal(activeBgIndex(0, start), start, `start=${start} 开局应显示自身`);
    assert.equal(activeBgIndex(60, start), (start + 1) % 4, `start=${start} 60s 前进一格`);
    assert.equal(activeBgIndex(180, start), (start + 3) % 4, `start=${start} 180s 前进三格`);
    assert.equal(activeBgIndex(BG_CYCLE_SEC, start), start, `start=${start} 满轮回到自身`);
  }
});

test('activeBgIndex 与 activeBgAt 一致，且始终在合法范围', () => {
  for (let start = 0; start < BG_ORDER.length; start++) {
    for (let sec = 0; sec < GAME_DURATION; sec += 7) {
      const idx = activeBgIndex(sec, start);
      assert.ok(idx >= 0 && idx < BG_ORDER.length, `越界 ${idx}`);
      assert.equal(activeBgAt(sec, start).key, BG_ORDER[idx].key);
    }
  }
});

test('nextBgIndex 循环前进且绝不越界', () => {
  for (let i = 0; i < BG_ORDER.length; i++) {
    const n = nextBgIndex(i);
    assert.equal(n, (i + 1) % BG_ORDER.length);
    assert.ok(n >= 0 && n < BG_ORDER.length);
  }
});

test('randomStartIndex 返回合法范围内下标', () => {
  for (let i = 0; i < 50; i++) {
    const idx = randomStartIndex(() => i / 50);
    assert.ok(idx >= 0 && idx < BG_ORDER.length);
  }
  // 注入固定 rng=0 → 第 0 张
  assert.equal(randomStartIndex(() => 0.0), 0);
});

test('切换参数为正且淡出短于淡入（清晰过渡）', () => {
  assert.ok(BG_FADE.outMs > 0 && BG_FADE.inMs > 0, '淡入淡出时长必须为正');
  assert.ok(BG_FADE.outMs < BG_FADE.inMs, '淡出应短于淡入，避免露底');
  assert.ok(BG_SWITCH_SEC > 0 && BG_CYCLE_SEC === BG_SWITCH_SEC * BG_ORDER.length);
});


test('manualHoldUntil 保持一个切换周期（手动切景不被时间轴拉回）', () => {
  // 手动切换后保持窗口 = elapsed + 一个切换周期
  assert.equal(manualHoldUntil(0), BG_SWITCH_SEC);
  assert.equal(manualHoldUntil(59.5), 59.5 + BG_SWITCH_SEC);
  // 保持窗口结束后，时间轴自然接回：手动 next 等价于时间轴前进一格
  // 例：startIndex=0 el=0 手动切到 1（保持到 60），60s 时时间轴自身应到 1
  assert.equal(activeBgIndex(manualHoldUntil(0), 0), 1, '保持窗口结束时时间轴应已到达手动选择的位置');
  // 保持窗口期内（0~59s）时间轴若按原逻辑仍在原位置——正因如此才需要保持窗口避免拉回
  assert.equal(activeBgIndex(30, 0), 0, '若无保持窗口，30s 时间轴仍在原背景，会覆盖手动选择——保持窗口防止此事');
});
