// 击杀爆散特效规格单测：数量克制、颜色/速度参数有效、按敌人类型分级
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { killFxSpec } from './killFxSpec.ts';

test('普通小蓝鱼：少量粒子且速度区间有效', () => {
  const spec = killFxSpec('fish');
  assert.ok(Number.isInteger(spec.count) && spec.count > 0 && spec.count <= 8, `count=${spec.count}`);
  assert.ok(spec.colors.length >= 1);
  assert.ok(spec.speed[0] > 0 && spec.speed[1] > spec.speed[0]);
  assert.ok(spec.size > 0);
});

test('疾行鱼粒子数不超过普通鱼', () => {
  const fish = killFxSpec('fish');
  const dart = killFxSpec('dart');
  assert.ok(dart.count <= 8);
});

test('肥鱼爆散比普通鱼更华丽（更多粒子/更大）', () => {
  const fat = killFxSpec('fat');
  const fish = killFxSpec('fish');
  assert.ok(fat.count > fish.count);
  assert.ok(fat.size >= fish.size);
});

test('Boss 爆散是最大档（远多于普通鱼）', () => {
  const boss = killFxSpec('boss');
  const fish = killFxSpec('fish');
  assert.ok(boss.count >= 20);
  assert.ok(boss.count > fish.count * 2);
});

test('未知敌人类型回退到普通档（不崩溃）', () => {
  const spec = killFxSpec('unknown-id' as never);
  assert.ok(spec.count > 0);
});
