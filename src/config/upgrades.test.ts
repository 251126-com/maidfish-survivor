// 升级池单测：回血技能改主题为「大白饭」且描述含恢复数值、可验证回复
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUFF_POOL, type PlayerStats } from './upgrades.ts';

test('回血技能已改主题为「大白饭」且描述含恢复数值、无换行溢出', () => {
  const hp = BUFF_POOL.find(b => b.id === 'hp');
  assert.ok(hp, '应存在回血技能 hp');
  assert.match(hp.name, /大白饭/, `实际名称 ${hp.name}`);
  assert.match(hp.desc, /\d+/, '描述应含恢复数值');
  assert.ok(!hp.desc.includes('\n'), '描述不应换行溢出卡片');
});

test('「大白饭」实际回复生命且不超上限', () => {
  const hp = BUFF_POOL.find(b => b.id === 'hp')!;
  const p: PlayerStats = { maxHp: 100, hp: 50, speed: 1, pickup: 1, critChance: 0, critMult: 1, damageMult: 1, xpMult: 1 };
  hp.apply(p);
  assert.equal(p.maxHp, 120);
  assert.equal(p.hp, 70, '应回复 20 且不超上限');
});
