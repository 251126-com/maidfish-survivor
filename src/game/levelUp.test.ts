// 升级系统单元测试：经验结转、连升多级、三选一选项约束、进化触发条件
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LevelSystem, rollUpgradeOptions, MAX_WEAPON_SLOTS } from './levelUp.ts';
import { xpNeed } from '../config/balance.ts';
import { WEAPONS, OBTAINABLE_WEAPONS } from '../config/weapons.ts';
import { BUFF_POOL, PASSIVES } from '../config/upgrades.ts';

// ---------- 经验 / 等级 ----------

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

// ---------- 三选一基础约束 ----------

const det = (seed: number) => () => ((seed * 9301 + 49297) % 233280) / 233280;

test('三选一返回 3 个互不重复的选项，且 id 全部合法', () => {
  const owned = [{ id: 'rifle', level: 1, maxed: false }];
  for (let seed = 0; seed < 60; seed++) {
    const opts = rollUpgradeOptions(owned, {}, det(seed));
    assert.equal(opts.length, 3);
    const keys = opts.map(o => `${o.kind}:${o.id}`);
    assert.equal(new Set(keys).size, 3, '选项不应重复');
    for (const o of opts) {
      if (o.kind === 'new_weapon') assert.ok(OBTAINABLE_WEAPONS.some(w => w.id === o.id), `${o.id} 非法`);
      if (o.kind === 'weapon_level') assert.ok(owned.some(x => x.id === o.id), '只能升级已拥有武器');
      if (o.kind === 'buff') assert.ok(BUFF_POOL.some(b => b.id === o.id), `${o.id} 非法 buff`);
      if (o.kind === 'passive') assert.ok(PASSIVES[o.id], `${o.id} 非法被动`);
    }
  }
});

test('新武器候选里永远不出现进化武器', () => {
  const owned: { id: string; level: number; maxed: boolean }[] = [];
  for (let seed = 0; seed < 80; seed++) {
    const opts = rollUpgradeOptions(owned, {}, det(seed));
    for (const o of opts) {
      if (o.kind === 'new_weapon') {
        assert.ok(!WEAPONS[o.id].evolved, `${o.id} 是进化武器，不应作为新武器出现`);
      }
    }
  }
});

test('武器槽满时不再提供新武器选项', () => {
  const owned = OBTAINABLE_WEAPONS.map(w => ({ id: w.id, level: 1, maxed: false }));
  const slots = owned.length;
  for (let seed = 0; seed < 30; seed++) {
    const opts = rollUpgradeOptions(owned, {}, det(seed), slots);
    assert.ok(opts.every(o => o.kind !== 'new_weapon'), '槽满不应再给新武器');
  }
});

test('全部武器满级且槽满时，只可能返回 buff、被动或质变（v0.12.0 质变不因满级消失）', () => {
  const owned = OBTAINABLE_WEAPONS.map(w => ({ id: w.id, level: WEAPONS[w.id].maxLevel, maxed: true }));
  const opts = rollUpgradeOptions(owned, {}, () => 0.42, owned.length);
  assert.ok(opts.every(o => o.kind === 'buff' || o.kind === 'passive' || o.kind === 'mutation'),
    '满级槽满时升级池不应出现 new_weapon/weapon_level/evolution（质变是满级武器的末盘提升，属合法项）');
});

// ---------- 进化 ----------

test('武器满级 + 持有钥匙被动 → 必定出现进化选项', () => {
  const owned = [{ id: 'rifle', level: WEAPONS.rifle.maxLevel, maxed: true }];
  for (let seed = 0; seed < 40; seed++) {
    const opts = rollUpgradeOptions(owned, { scope: 1 }, det(seed));
    const evo = opts.find(o => o.kind === 'evolution');
    assert.ok(evo, `seed ${seed}: 进化选项必须出现（不能被洗牌挤掉）`);
    assert.equal(evo!.id, 'rifle');
    assert.ok(evo!.name.includes(WEAPONS.railgun.name), '进化名称应指向目标武器');
  }
});

test('武器未满级时不出现进化', () => {
  const owned = [{ id: 'rifle', level: WEAPONS.rifle.maxLevel - 1, maxed: false }];
  const opts = rollUpgradeOptions(owned, { scope: 3 }, () => 0.1);
  assert.ok(!opts.some(o => o.kind === 'evolution'));
});

test('没有钥匙被动时不出现进化', () => {
  const owned = [{ id: 'rifle', level: WEAPONS.rifle.maxLevel, maxed: true }];
  const opts = rollUpgradeOptions(owned, {}, () => 0.1);
  assert.ok(!opts.some(o => o.kind === 'evolution'), '没有瞄准镜不该能进化');
});

test('进化后不再重复提供同一进化', () => {
  const owned = [
    { id: 'rifle', level: WEAPONS.rifle.maxLevel, maxed: true },
    { id: 'railgun', level: 1, maxed: true }
  ];
  const opts = rollUpgradeOptions(owned, { scope: 2 }, () => 0.1);
  assert.ok(!opts.some(o => o.kind === 'evolution'), '已进化过不应再出现');
});

test('狙击枪走另一条进化线', () => {
  const owned = [{ id: 'sniper', level: WEAPONS.sniper.maxLevel, maxed: true }];
  const opts = rollUpgradeOptions(owned, { maidband: 1 }, () => 0.7);
  const evo = opts.find(o => o.kind === 'evolution');
  assert.ok(evo);
  assert.ok(evo!.name.includes(WEAPONS.fatfishCannon.name));
});

test('进化选项与同武器升级选项不会同时出现', () => {
  const owned = [{ id: 'rifle', level: WEAPONS.rifle.maxLevel, maxed: true }];
  const opts = rollUpgradeOptions(owned, { scope: 1 }, () => 0.3);
  const hasEvo = opts.some(o => o.kind === 'evolution' && o.id === 'rifle');
  const hasLv = opts.some(o => o.kind === 'weapon_level' && o.id === 'rifle');
  assert.ok(!(hasEvo && hasLv), '满级武器本就不该有升级项，两者更不能并存');
});

test('被动达到上限后不再出现该被动选项', () => {
  const owned = [{ id: 'rifle', level: 1, maxed: false }];
  const opts = rollUpgradeOptions(owned, { scope: PASSIVES.scope.maxLevel }, () => 0.2);
  assert.ok(!opts.some(o => o.kind === 'passive' && o.id === 'scope'));
});

test('选项数量不足 3 时返回实际数量（不报错）', () => {
  const owned = OBTAINABLE_WEAPONS.map(w => ({ id: w.id, level: WEAPONS[w.id].maxLevel, maxed: true }));
  const opts = rollUpgradeOptions(owned, {}, () => 0.5, owned.length);
  assert.ok(opts.length >= 1 && opts.length <= 3);
});
// ---------- v0.12.0 质变升级 ----------

test('武器达 Lv3 后升级池出现质变卡（金色 kind），未满 3 级不出现', () => {
  // Lv2：不应有质变
  const owned2 = [{ id: 'rifle', level: 2, maxed: false }];
  for (let seed = 0; seed < 40; seed++) {
    const opts = rollUpgradeOptions(owned2, {}, det(seed));
    assert.ok(!opts.some(o => o.kind === 'mutation'), 'Lv2 不应出现质变卡');
  }
  // Lv3：质变卡进入候选
  const owned3 = [{ id: 'rifle', level: 3, maxed: false }];
  let sawMutation = false;
  for (let seed = 0; seed < 200; seed++) {
    const opts = rollUpgradeOptions(owned3, {}, det(seed));
    assert.equal(opts.length, 3);
    for (const o of opts) {
      if (o.kind === 'mutation') {
        sawMutation = true;
        assert.ok(o.name.includes('质变'), '质变卡名应带「质变」前缀');
        const w = WEAPONS['rifle'];
        assert.ok(w.mutations!.some(m => m.id === o.id), '质变 id 必须来自武器配置');
      }
    }
  }
  assert.ok(sawMutation, 'Lv3 步枪在 200 次采样里应至少出现一次质变卡（3倍权重）');
});

test('已挂质变的武器不再出现其质变卡', () => {
  const owned = [{ id: 'shotgun', level: 4, maxed: false, mutation: 'sg_burn' }];
  for (let seed = 0; seed < 60; seed++) {
    const opts = rollUpgradeOptions(owned, {}, det(seed));
    assert.ok(!opts.some(o => o.kind === 'mutation' && o.id === 'sg_burn'),
      '已挂质变 sg_burn 后不应再出现该卡');
  }
});

test('质变与普通升级在池中共存：同一把武器可同时出现强化卡与质变卡', () => {
  const owned = [{ id: 'rifle', level: 3, maxed: false }];
  let both = false;
  for (let seed = 0; seed < 200; seed++) {
    const opts = rollUpgradeOptions(owned, {}, det(seed));
    if (opts.some(o => o.kind === 'weapon_level' && o.id === 'rifle')
      && opts.some(o => o.kind === 'mutation')) { both = true; break; }
  }
  assert.ok(both, '步枪 Lv3 的三选一应有机会同时出现「武器强化」与「质变」');
});

test('新武器（珊瑚弩/电鳗/泡泡枪/激光）都在可获取池，且 Lv3 有质变分支', () => {
  for (const id of ['coral', 'eel', 'bubble', 'laser']) {
    const w = WEAPONS[id];
    assert.ok(w, `${id} 武器必须存在`);
    assert.ok(OBTAINABLE_WEAPONS.some(x => x.id === id), `${id} 应可从升级池获取`);
    assert.ok(w.mutations && w.mutations.length >= 2, `${id} 应有质变分支`);
  }
});
