// 特殊掉落纯逻辑单测：极低概率、可注入随机源、回血不超上限
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rollSpecialDrop, healClamp,
  RICE_HEAL, RICE_DROP_CHANCE, BOWL_DROP_CHANCE
} from './collectibles.ts';

test('极低随机值落在饭盆阈值内 → 掉饭盆', () => {
  assert.equal(rollSpecialDrop(() => BOWL_DROP_CHANCE / 2), 'bowl');
});
test('落入饭盆+饭区间 → 掉大白饭', () => {
  assert.equal(rollSpecialDrop(() => BOWL_DROP_CHANCE + RICE_DROP_CHANCE / 2), 'rice');
});
test('超出总概率 → 不掉特殊物品', () => {
  assert.equal(rollSpecialDrop(() => BOWL_DROP_CHANCE + RICE_DROP_CHANCE + 0.01), null);
});
test('默认概率极低，且饭盆比饭更稀有', () => {
  assert.ok(RICE_DROP_CHANCE < 0.05, '饭掉落概率应默认极小');
  assert.ok(BOWL_DROP_CHANCE < RICE_DROP_CHANCE, '饭盆应比饭更稀有');
  assert.ok(RICE_HEAL > 0);
});
test('随机源跨多次调用保持独立（无副作用）', () => {
  let i = 0;
  const rng = () => [0.001, 0.01, 0.9, 0.003][i++ % 4];
  const got = [rollSpecialDrop(rng), rollSpecialDrop(rng), rollSpecialDrop(rng), rollSpecialDrop(rng)];
  assert.deepEqual(got, ['bowl', 'rice', null, 'bowl']);
});
test('回血 clamp：不超最大 HP', () => {
  assert.equal(healClamp(90, 100, RICE_HEAL), 100);
  assert.equal(healClamp(50, 100, RICE_HEAL), 70);
});
