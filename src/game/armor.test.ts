// 护甲系统纯逻辑单测：饭盆拾取、护甲吸收/破碎、原立绘恢复判定
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyArmor, applyBowlPickup, absorbDamage, shouldShowBowl, ARMOR_MAX } from './armor.ts';

test('拾取饭盆：无护甲 → 获得满 30 护甲', () => {
  const s = emptyArmor();
  assert.equal(applyBowlPickup(s), 'new');
  assert.equal(s.armor, ARMOR_MAX);
  assert.equal(s.max, ARMOR_MAX);
  assert.ok(shouldShowBowl(s));
});

test('拾取饭盆：已有护甲未满 → 刷新回满，不叠加超 30', () => {
  const s = emptyArmor();
  applyBowlPickup(s);
  s.armor = 10;
  assert.equal(applyBowlPickup(s), 'refill');
  assert.equal(s.armor, ARMOR_MAX);
});

test('拾取饭盆：护甲已满 → 不变化，不浪费上限', () => {
  const s = emptyArmor();
  applyBowlPickup(s);
  assert.equal(applyBowlPickup(s), 'full');
  assert.equal(s.armor, ARMOR_MAX);
});

test('受伤优先扣护甲：护甲充足时 HP 不掉', () => {
  const s = emptyArmor(); applyBowlPickup(s);
  const r = absorbDamage(s, 12);
  assert.deepEqual({ a: r.absorbed, d: r.hpDmg, b: r.broken }, { a: 12, d: 0, b: false });
  assert.equal(s.armor, ARMOR_MAX - 12);
});

test('护甲被击穿：溢出伤害落到 HP 且 broken=true（触发恢复原立绘）', () => {
  const s = emptyArmor(); applyBowlPickup(s); s.armor = 5;
  const r = absorbDamage(s, 20);
  assert.equal(r.absorbed, 5);
  assert.equal(r.hpDmg, 15);
  assert.equal(r.broken, true);
  assert.equal(s.armor, 0);
  assert.ok(!shouldShowBowl(s), '破盾后不应再显示饭盆');
});

test('护甲恰好耗尽：broken=true 但 HP 不掉', () => {
  const s = emptyArmor(); applyBowlPickup(s); s.armor = 10;
  const r = absorbDamage(s, 10);
  assert.equal(r.hpDmg, 0);
  assert.equal(r.broken, true);
  assert.equal(s.armor, 0);
});

test('无护甲时伤害全落 HP，不标记破碎', () => {
  const s = emptyArmor();
  const r = absorbDamage(s, 7);
  assert.equal(r.hpDmg, 7);
  assert.equal(r.broken, false);
});

test('护甲不会被打成负数', () => {
  const s = emptyArmor();
  s.armor = 3;
  const r = absorbDamage(s, 100);
  assert.equal(r.hpDmg, 97);
  assert.equal(s.armor, 0);
});
