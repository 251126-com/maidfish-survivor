// 存档单元测试：用内存 mock 替代 localStorage
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 在导入 save 之前注入 localStorage mock
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); }
};

const { loadSave, writeSave, metaBonus } = await import('./save.ts');

test('无存档时返回默认值', () => {
  store.clear();
  const s = loadSave();
  assert.equal(s.gold, 0);
  assert.deepEqual(s.meta, {});
  assert.equal(s.best.kills, 0);
});

test('写入后可完整读回', () => {
  store.clear();
  const s = loadSave();
  s.gold = 500;
  s.meta['meta_atk'] = 3;
  s.best.kills = 42;
  writeSave(s);
  const back = loadSave();
  assert.equal(back.gold, 500);
  assert.equal(back.meta['meta_atk'], 3);
  assert.equal(back.best.kills, 42);
});

test('损坏 JSON 不崩溃，回退默认值', () => {
  store.clear();
  store.set('maidfish-survivor-save-v1', '{坏掉的json');
  assert.doesNotThrow(() => loadSave());
  assert.equal(loadSave().gold, 0);
});

test('旧存档缺字段时按默认补全', () => {
  store.clear();
  store.set('maidfish-survivor-save-v1', JSON.stringify({ gold: 100 }));
  const s = loadSave();
  assert.equal(s.gold, 100);
  assert.deepEqual(s.meta, {});
  assert.equal(s.best.level, 0);
});

test('metaBonus 按等级换算加成', () => {
  const b = metaBonus({
    version: 1, gold: 0,
    meta: { meta_atk: 2, meta_hp: 3, meta_spd: 1, meta_pick: 2, meta_crit: 1, meta_xp: 2 },
    best: { time: 0, kills: 0, level: 0 }
  });
  assert.equal(Math.round(b.damageMult * 100), 110);  // 1 + 2*0.05
  assert.equal(b.maxHp, 30);                          // 3*10
  assert.equal(Math.round(b.speedMult * 100), 103);   // 1 + 1*0.03
  assert.equal(b.pickup, 24);                         // 2*12
  assert.equal(Math.round(b.critChance * 100), 2);    // 1*0.02
  assert.equal(Math.round(b.xpMult * 100), 110);      // 1 + 2*0.05
});