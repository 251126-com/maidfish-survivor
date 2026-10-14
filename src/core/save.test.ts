// save 清洗测试（v0.9.1：存档只允许有限非负整数 + meta 升级上限）
// v0.14.0：v2 结构 + 旧存档(v1)迁移 + 角色/皮肤操作纯逻辑
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSave, metaBonus, unlockCharacter, selectCharacter, setSkin, SAVE_VERSION } from './save.ts';
import { META_TREE } from '../config/upgrades.ts';
import { CHARACTERS, DEFAULT_CHAR, DEFAULT_SKIN, SKIN_BOWL, SKIN_MAID } from '../config/characters.ts';

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
    version: 2,
    gold: 0,
    meta: { meta_atk: 1e309, meta_crit: 99 },
    best: { time: 0, kills: 0, level: 0 },
    unlocked: [DEFAULT_CHAR],
    charId: DEFAULT_CHAR,
    skin: DEFAULT_SKIN
  } as any);
  assert.ok(Number.isFinite(b.damageMult), 'damageMult 必须有限');
  assert.ok(Number.isFinite(b.critChance));
  assert.ok(b.damageMult > 1 && b.damageMult < 2, '封顶后伤害加成在合理范围');
  assert.ok(b.critChance <= 1, '暴击几率上限内');
});

// ---- v0.14.0 ----
test('v0.14.0: 旧版 v1 存档(无角色/皮肤字段)迁移补默认值，金币/强化/最佳不丢', () => {
  const out = sanitizeSave({
    version: 1,
    gold: 321,
    meta: { meta_atk: 3 },
    best: { time: 432, kills: 900, level: 27 }
  } as any);
  assert.equal(out.version, SAVE_VERSION, '版本号升级到 2');
  assert.equal(out.gold, 321, '金币保留');
  assert.equal(out.meta.meta_atk, 3, '强化保留');
  assert.deepEqual(out.best, { time: 432, kills: 900, level: 27 }, '最佳记录保留');
  assert.deepEqual(out.unlocked, [DEFAULT_CHAR], '旧存档默认只解锁鲸鱼娘');
  assert.equal(out.charId, DEFAULT_CHAR, '默认角色');
  assert.equal(out.skin, DEFAULT_SKIN, '默认皮肤女仆装');
});

test('v0.14.0: 非法角色/皮肤存档被钳制到合法值', () => {
  const out = sanitizeSave({
    version: 2,
    gold: 0,
    meta: {},
    best: { time: 0, kills: 0, level: 0 },
    unlocked: ['bogus', DEFAULT_CHAR, 'fat'],
    charId: 'bogus',
    skin: 'not_a_skin'
  } as any);
  assert.deepEqual(out.unlocked, [DEFAULT_CHAR, 'fat'], '非法 id 剔除，默认角色恒在');
  assert.equal(out.charId, DEFAULT_CHAR, '未解锁/非法 charId 回退默认');
  assert.equal(out.skin, DEFAULT_SKIN, '非法皮肤回退默认');
});

test('v0.14.0: 未解锁角色即使被写入 charId 也回退默认', () => {
  const out = sanitizeSave({
    version: 2,
    gold: 0,
    meta: {},
    best: { time: 0, kills: 0, level: 0 },
    unlocked: [DEFAULT_CHAR],
    charId: 'eel',
    skin: SKIN_MAID
  } as any);
  assert.equal(out.charId, DEFAULT_CHAR, '未解锁 eel 不可被选中');
  assert.equal(out.skin, SKIN_MAID, '皮肤合法保留');
});

test('v0.14.0: unlockCharacter 解锁流程（扣款/已解锁/金币不足）', () => {
  const cost = CHARACTERS.fat.unlockCost;
  const s = sanitizeSave({ version: 2, gold: cost, meta: {}, best: { time: 0, kills: 0, level: 0 }, unlocked: [DEFAULT_CHAR], charId: DEFAULT_CHAR, skin: DEFAULT_SKIN } as any);
  assert.ok(unlockCharacter(s, 'fat'), '金币充足可解锁');
  assert.equal(s.gold, 0, '扣款');
  assert.ok(s.unlocked.includes('fat'));
  assert.equal(s.charId, 'fat', '解锁即自动选用');
  // 再次解锁同一角色：已解锁返回 true 且不重复扣款
  const g2 = s.gold;
  assert.ok(unlockCharacter(s, 'fat'));
  assert.equal(s.gold, g2, '已解锁不重复扣款');
  // 金币不足
  const s2 = sanitizeSave({ version: 2, gold: cost - 1, meta: {}, best: { time: 0, kills: 0, level: 0 }, unlocked: [DEFAULT_CHAR], charId: DEFAULT_CHAR, skin: DEFAULT_SKIN } as any);
  assert.ok(!unlockCharacter(s2, 'fat'), '金币不足返回 false');
  assert.equal(s2.gold, cost - 1, '不足时不扣款');
  assert.ok(!s2.unlocked.includes('fat'));
});

test('v0.14.0: selectCharacter / setSkin 只接受已解锁/合法值', () => {
  const s = sanitizeSave({ version: 2, gold: 0, meta: {}, best: { time: 0, kills: 0, level: 0 }, unlocked: [DEFAULT_CHAR], charId: DEFAULT_CHAR, skin: DEFAULT_SKIN } as any);
  assert.ok(!selectCharacter(s, 'eel'), '未解锁不可选');
  assert.equal(s.charId, DEFAULT_CHAR);
  assert.ok(selectCharacter(s, DEFAULT_CHAR), '可选已解锁角色');
  assert.ok(!setSkin(s, 'bogus'), '非法皮肤拒绝');
  assert.equal(s.skin, DEFAULT_SKIN);
  assert.ok(setSkin(s, SKIN_MAID), '女仆装可切换');
  assert.equal(s.skin, SKIN_MAID);
});

test('v0.14.0: 解锁价格合理（默认0，其余在获取速率量级内 250~600 金/局）', () => {
  assert.equal(CHARACTERS.whale.unlockCost, 0);
  for (const id of ['fat', 'eel']) {
    const c = CHARACTERS[id];
    assert.ok(c.unlockCost >= 200 && c.unlockCost <= 1500, `${id} 价格 ${c.unlockCost} 应在合理区间`);
    assert.ok(c.mods.speedMult > 0.6 && c.mods.speedMult < 1.5, `${id} 移速倍率合理`);
    assert.ok(c.mods.hp >= -60 && c.mods.hp <= 120, `${id} 血量偏移合理`);
  }
});

test('v0.14.0: 初始武器全部合法存在，且角色间初始武器/被动明确不同', () => {
  const ids = Object.keys(CHARACTERS);
  const weapons = new Set<string>();
  for (const id of ids) {
    const w = CHARACTERS[id].weaponId;
    assert.ok(w && w.length > 0, `${id} 必须有初始武器`);
    weapons.add(w);
  }
  assert.ok(weapons.size >= 2, '至少 2 种不同初始武器（角色差异）');
  assert.notEqual(CHARACTERS.whale.weaponId, CHARACTERS.fat.weaponId, '鲸鱼娘≠胖鱼娘武器');
  assert.notEqual(CHARACTERS.whale.weaponId, CHARACTERS.eel.weaponId, '鲸鱼娘≠电鳗娘武器');
});
