// 数值配置测试：经验曲线单调、刷怪时间轴选段正确、权重选取不越界
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xpNeed, hpScale, speedScale, POOL_LIMIT, BOSS_TIME, BOSS_WARN_TIME } from './balance.ts';
import { currentPhase, pickEnemy, SPAWN_TIMELINE, WAVE_EVENTS } from './timeline.ts';
import { WEAPONS } from './weapons.ts';
import { ENEMIES } from './enemies.ts';

test('经验曲线随等级严格递增', () => {
  for (let lv = 1; lv < 20; lv++) {
    assert.ok(xpNeed(lv + 1) > xpNeed(lv), `lv${lv}->${lv + 1} 必须递增`);
  }
});

test('v0.10: 首次升级门槛下调（1级仅需 ~14 经验，配合开局波次 20s 内升级）', () => {
  assert.ok(xpNeed(1) <= 17, `首次升级门槛应足够低，当前 ${xpNeed(1)}`);
  assert.ok(xpNeed(2) <= 34, `2级门槛 ${xpNeed(2)} 应低于旧版 33~35`);
});

test('v0.10: Boss 提前到 150s（玩家一局必然见到，且有预警提前量）', () => {
  assert.equal(BOSS_TIME, 150, 'Boss 应提前到 150s');
  assert.ok(BOSS_TIME < 600, '不应再是 600s 的远未来 Boss');
  assert.ok(BOSS_WARN_TIME > 0 && BOSS_WARN_TIME < BOSS_TIME, 'Boss 预警提前量需在 (0, BOSS_TIME) 区间内');
});

test('v0.10: 开局波次事件升序、0s 即有、半径小（进屏快）、敌人 id 合法', () => {
  assert.equal(WAVE_EVENTS[0].atSec, 0, '开局立即有一波');
  let prev = -1;
  for (const ev of WAVE_EVENTS) {
    assert.ok(ev.atSec > prev, '波次时间必须严格升序');
    prev = ev.atSec;
    assert.ok(ev.radius < 700, `波次生成半径 ${ev.radius} 应小于常规 760~980，保证 10s 内进屏`);
    assert.ok(ev.label.length > 0, '波次要有横幅文案');
    for (const [id, n] of ev.burst) {
      assert.ok(ENEMIES[id], `波次敌人 ${id} 必须在敌人表里`);
      assert.ok(n > 0, '波次数量必须为正');
    }
  }
});

test('v0.10: 前 60s 刷怪节奏变密（间隔从 1100ms 提速），但 0s 阶段不刷屏', () => {
  assert.equal(SPAWN_TIMELINE[0].fromSec, 0);
  assert.equal(SPAWN_TIMELINE[0].intervalMs, 1100, '开局 1100ms/只，可感知但可读');
  const t60 = currentPhase(59).fromSec;
  assert.ok(t60 <= 60, `60s 时应已进入更密阶段，当前 ${t60}s`);
  assert.ok(currentPhase(59).intervalMs < 800, `60s 附近间隔应已提速，当前 ${currentPhase(59).intervalMs}ms`);
});

test('敌人成长曲线随时间递增且有上限', () => {
  assert.ok(hpScale(600) > hpScale(0));
  assert.ok(speedScale(600) > speedScale(0));
  assert.ok(speedScale(99999) <= 1.5, '移速加成必须有封顶');
});

test('currentPhase 按时间取到正确阶段', () => {
  assert.equal(currentPhase(0).fromSec, 0);
  assert.equal(currentPhase(100).fromSec, 60);
  assert.equal(currentPhase(9999).fromSec, SPAWN_TIMELINE[SPAWN_TIMELINE.length - 1].fromSec);
});

test('pickEnemy 只返回该阶段权重内的敌人 id', () => {
  for (const phase of SPAWN_TIMELINE) {
    const allowed = new Set(phase.weights.map(w => w[0]));
    for (let i = 0; i < 200; i++) {
      const id = pickEnemy(phase);
      assert.ok(allowed.has(id), `${id} 不在阶段 ${phase.fromSec}s 的权重表里`);
      assert.ok(ENEMIES[id], `${id} 必须在敌人表里存在`);
    }
  }
});

test('武器等级表长度与 maxLevel 一致，且数值不倒退', () => {
  for (const w of Object.values(WEAPONS)) {
    assert.equal(w.levels.length, w.maxLevel, `${w.id} 等级表长度不符`);
    for (let i = 1; i < w.levels.length; i++) {
      assert.ok(w.levels[i].damage >= w.levels[i - 1].damage, `${w.id} 伤害不应倒退`);
      assert.ok(w.levels[i].cooldown <= w.levels[i - 1].cooldown, `${w.id} 冷却不应变长`);
    }
  }
});

test('武器进化配方指向已存在的被动', () => {
  const passiveIds = new Set(['scope', 'maidband']);
  for (const w of Object.values(WEAPONS)) {
    if (w.evolution) assert.ok(passiveIds.has(w.evolution.requiredPassive), `${w.id} 进化钥匙不存在`);
  }
});

test('池上限为正整数', () => {
  for (const [k, v] of Object.entries(POOL_LIMIT)) {
    assert.ok(Number.isInteger(v) && v > 0, `${k} 上限非法`);
  }
});
