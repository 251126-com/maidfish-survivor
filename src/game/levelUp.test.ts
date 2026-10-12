// 升级系统单元测试：经验结转、连升多级、三选一选项约束
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LevelSystem, rollUpgradeOptions, MAX_WEAPON_SLOTS } from './levelUp.ts';
import { xpNeed } from '../config/balance.ts';
import { WEAPONS } from '../config/weapons.ts';
import { BUFF_POOL } from '../config/upgrades.ts';

test('经验不足时不升级', () => {
  const ls = new LevelSystem();
  ls.addXp(xpNeed(1) - 1);
  assert.equal(ls.level, 1);
  assert.equal(ls.pending, 0);
});

test('经验刚好达标升一级并清零结转', () => {
  const ls = new LevelSystem();
  ls.addXp(xpNeed(1));
  assert.equal(ls.level, 2);
  assert.equal(ls.xp, 0);
  assert.equal(ls.pending, 1);
});

test('一次吃大量经验可连升多级，且经验正确结转', () => {
  const ls = new LevelSystem();
  const total = xpNeed(1) + xpNeed(2) + xpNeed(3) + 5;
  ls.addXp(total);
  assert.equal(ls.level, 4);
  assert.equal(ls.xp, 5, '剩余经验应结转');
  assert.equal(ls.pending, 3);
});

test('经验倍率生效', () => {
  const ls = new LevelSystem();
  ls.addXp(xpNeed(1) / 2, 2);
  assert.equal(ls.level, 2, '双倍经验应刚好升级');
});

test('consumeLevelUp 逐次消耗，不会超支', () => {
  const ls = new LevelSystem();
  ls.addXp(xpNeed(1));
  assert.equal(ls.consumeLevelUp(), true);
  assert.equal(ls.consumeLevelUp(), false, '没有待处理升级时应返回 false');
});

test('三选一返回 3 个互不重复的选项', () => {
  const owned = [{ id: 'rifle', level: 1, maxed: false }];
  for (let seed = 0; seed < 50; seed++) {
    const rng = () => ((seed * 9301 + 49297) % 233280) / 233280;
    const opts = rollUpgradeOptions(owned, rng);
    assert.equal(opts.length, 3);
    const keys = opts.map(o => `${o.kind}:${o.id}`);
    assert.equal(new Set(keys).size, 3, '选项不应重复');
    for (const o of opts) {
      if (o.kind === 'new_weapon') assert.ok(WEAPONS[o.id], `${o.id} 必须是合法武器`);
      if (o.kind === 'weapon_level') assert.ok(owned.some(x => x.id === o.id), '只能升级已拥有的武器');
      if (o.kind === 'buff') assert.ok(BUFF_POOL.some(b => b.id === o.id), `${o.id} 必须是合法 buff`);
    }
  }
});

test('武器槽满时不再提供新武器选项', () => {
  const owned = Object.keys(WEAPONS).map(id => ({ id, level: 1, maxed: false }));
  // 关键：把槽位设为刚好等于已有武器数，才构成"槽满"场景
  const slots = owned.length;
  for (let seed = 0; seed < 30; seed++) {
    const rng = () => ((seed * 7919 + 104729) % 233280) / 233280;
    const opts = rollUpgradeOptions(owned, rng, slots);
    assert.ok(opts.every(o => o.kind !== 'new_weapon'), '槽满不应再给新武器');
    assert.equal(opts.length, 3);
  }
});

test('槽位未满时仍可能提供新武器', () => {
  const owned = [{ id: 'rifle', level: 1, maxed: false }];
  // 遍历多个随机种子，只要出现过一次 new_weapon 即说明该分支可达
  let seen = false;
  for (let seed = 0; seed < 200 && !seen; seed++) {
    const rng = () => ((seed * 9301 + 49297) % 233280) / 233280;
    const opts = rollUpgradeOptions(owned, rng, MAX_WEAPON_SLOTS);
    if (opts.some(o => o.kind === 'new_weapon')) seen = true;
  }
  assert.ok(seen, '槽位未满时新武器分支应当可达');
});

test('全部武器满级且槽满时，只可能返回 buff', () => {
  const owned = Object.keys(WEAPONS).map(id => ({ id, level: WEAPONS[id].maxLevel, maxed: true }));
  const opts = rollUpgradeOptions(owned, () => 0.42);
  assert.ok(opts.every(o => o.kind === 'buff'));
});

test('选项数量不足 3 时返回实际数量（不报错）', () => {
  // 构造极端场景：槽满 + 全满级 + 空 buff 池是不可能的，这里验证函数不崩且长度合理
  const owned = Object.keys(WEAPONS).map(id => ({ id, level: WEAPONS[id].maxLevel, maxed: true }));
  const opts = rollUpgradeOptions(owned, () => 0.5);
  assert.ok(opts.length >= 1 && opts.length <= 3);
});