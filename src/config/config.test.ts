// 数值配置测试：经验曲线单调、刷怪时间轴选段正确、权重选取不越界
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xpNeed, hpScale, speedScale, POOL_LIMIT } from './balance.ts';
import { currentPhase, pickEnemy, SPAWN_TIMELINE } from './timeline.ts';
import { WEAPONS } from './weapons.ts';
import { ENEMIES } from './enemies.ts';

test('经验曲线随等级严格递增', () => {
  for (let lv = 1; lv < 20; lv++) {
    assert.ok(xpNeed(lv + 1) > xpNeed(lv), `lv${lv}->${lv + 1} 必须递增`);
  }
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