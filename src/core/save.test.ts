// save 清洗测试（v0.9.1：存档只允许有限非负整数 + meta 升级上限）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSave, metaBonus } from './save.ts';
import { META_TREE } from '../config/upgrades.ts';

test('sanitizeSave: 1e309(=Infinity)/NaN/负数/小数 全部钳制为有限非负整数', () => {
  const out = sanitizeSave({
    version: 1,
    gold: 1e309,                       // JSON 里会变成 Infinity
    meta: { meta_atk: Infinity, meta_hp: -3, meta_spd: 2.9, bogus: 7 },
    best: { time: NaN, kills: -5, level: 1e308 }
  } as any);
  assert.equal(out.gold, 0, 'Infinity gold -> 0');
  assert.equal(out.meta.meta_atk, 0, 'Infinity rank -> 0');
  assert.equal(out.meta.meta_hp, 0, '负数 rank -> 0');
  assert.equal(out.meta.meta_spd, 2, '小数 rank -> 向下取整');
  assert.ok(Number.isFinite(out.best.time) && Number.isFinite(out.best.level));
  assert.ok(out.best.time >= 0 && out.best.level >= 0);
  assert.equal(out.best.kills, 0, '负数 kills -> 0');
});

test('sanitizeSave: meta 等级受 META_TREE.maxRank 升级上限约束', () => {
  const maxAtk = META_TREE.find(m => m.id === 'meta_atk')!.maxRank;
  const out = sanitizeSave({
    version: 1,
    gold: 10,
    meta: { meta_atk: 99999 },
    best: { time: 1, kills: 1, level: 1 }
  } as any);
  assert.equal(out.meta.meta_atk, maxAtk, '越界 rank 封顶到 maxRank');
});

test('metaBonus: 越界/Infinity rank 封顶后加成仍为有限数', () => {
  const b = metaBonus({
    version: 1,
    gold: 0,
    meta: { meta_atk: 1e309, meta_crit: 99 },
    best: { time: 0, kills: 0, level: 0 }
  } as any);
  assert.ok(Number.isFinite(b.damageMult), 'damageMult 必须有限');
  assert.ok(Number.isFinite(b.critChance));
  assert.ok(b.damageMult > 1 && b.damageMult < 2, '封顶后伤害加成在合理范围');
  assert.ok(b.critChance <= 1, '暴击几率上限内');
});
