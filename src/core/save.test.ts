// save 清洗测试（v0.9.1：存档只允许有限非负整数 + meta 升级上限）
// v0.14.0：v2 结构 + 旧存档(v1)迁移 + 角色/皮肤操作纯逻辑
// v0.15.0：v3 结构 + 角色系统移除（胖鱼娘/电鳗娘回落鲸鱼娘 + 金币退回）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSave, metaBonus, setSkin, SAVE_VERSION } from './save.ts';
import { META_TREE } from '../config/upgrades.ts';
import { DEFAULT_CHAR, DEFAULT_SKIN, SKIN_BOWL, SKIN_MAID, CHARACTERS } from '../config/characters.ts';

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
  assert.ok(Number.isFinite(out.best.time) && out.best.time >= 0, 'NaN best.time -> 0');
  assert.equal(out.best.kills, 0, '负数 best.kills -> 0');
  assert.ok(Number.isFinite(out.best.level) && out.best.level >= 0, '1e308 -> 有限非负整数');
});

test('sanitizeSave: 非法 meta id 保留原值，合法 id 按 maxRank 封顶', () => {
  const out = sanitizeSave({
    version: 1, gold: 0, meta: { meta_atk: 999, meta_hp: 3, bogus: 7 },
    best: { time: 0, kills: 0, level: 0 }
  } as any);
  const atkDef = META_TREE.find(m => m.id === 'meta_atk')!;
  assert.equal(out.meta.meta_atk, atkDef.maxRank, '越界 rank 封顶');
  assert.equal(out.meta.meta_hp, 3, '合法 rank 保留');
  assert.equal(out.meta.bogus, 7, '未知 id 原样保留（不丢数据）');
});

test('v0.15.0: 旧 v2 存档(已解锁胖鱼娘/电鳗娘)自动回落到鲸鱼娘，金币按解锁价退回', () => {
  // 模拟 v0.14.0 已付费解锁 fat(400)+eel(800) 的存档
  const out = sanitizeSave({
    version: 2,
    gold: 123,
    meta: { meta_atk: 2 },
    best: { time: 120, kills: 30, level: 8 },
    unlocked: [DEFAULT_CHAR, 'fat', 'eel'],
    charId: 'eel',
    skin: SKIN_BOWL
  } as any);
  assert.deepEqual(out.unlocked, [DEFAULT_CHAR], 'unlocked 回落为仅鲸鱼娘');
  assert.equal(out.charId, DEFAULT_CHAR, '选用其他角色回落鲸鱼娘');
  assert.equal(out.gold, 123 + 400 + 800, '已花金币解锁的角色按价退回（123+400+800）');
  assert.equal(out.meta.meta_atk, 2, '强化不丢');
  assert.equal(out.best.time, 120, '最佳记录不丢');
  assert.equal(out.best.kills, 30, '击杀不丢');
  assert.equal(out.skin, SKIN_BOWL, '皮肤保留');
  assert.equal(out.version, SAVE_VERSION, '版本升到 v3');
});

test('v0.15.0: 旧 v2 存档只解锁过胖鱼娘 → 只退 400，强化/金币其他部分不动', () => {
  const out = sanitizeSave({
    version: 2,
    gold: 500,
    meta: {},
    best: { time: 0, kills: 0, level: 0 },
    unlocked: [DEFAULT_CHAR, 'fat'],
    charId: 'fat',
    skin: SKIN_MAID
  } as any);
  assert.deepEqual(out.unlocked, [DEFAULT_CHAR]);
  assert.equal(out.charId, DEFAULT_CHAR);
  assert.equal(out.gold, 500 + 400, '只退 fat 的 400');
});

test('v0.15.0: 未解锁过移除角色的存档不退金币（不凭空给钱）', () => {
  const out = sanitizeSave({
    version: 2,
    gold: 777,
    meta: { meta_atk: 2 },
    best: { time: 120, kills: 30, level: 8 },
    unlocked: [DEFAULT_CHAR],
    charId: DEFAULT_CHAR,
    skin: SKIN_MAID
  } as any);
  assert.deepEqual(out.unlocked, [DEFAULT_CHAR]);
  assert.equal(out.charId, DEFAULT_CHAR);
  assert.equal(out.gold, 777, '金币原样保留');
  assert.equal(out.meta.meta_atk, 2, '强化原样保留');
});

test('v0.15.0: 再次清洗不含移除角色的存档不重复退款', () => {
  const once = sanitizeSave({
    version: 2, gold: 10,
    meta: {}, best: { time: 0, kills: 0, level: 0 },
    unlocked: [DEFAULT_CHAR, 'fat'], charId: 'fat', skin: SKIN_MAID
  } as any);
  const twice = sanitizeSave(once as any);
  assert.equal(once.gold, 410);
  assert.equal(twice.gold, 410, '第二次清洗不加成');
});

test('v0.14.0: 皮肤只接受合法值，女仆装/饭盆头可切换', () => {
  const s = sanitizeSave({ version: 3, gold: 0, meta: {}, best: { time: 0, kills: 0, level: 0 }, unlocked: [DEFAULT_CHAR], charId: DEFAULT_CHAR, skin: DEFAULT_SKIN } as any);
  assert.ok(!setSkin(s, 'bogus'), '非法皮肤拒绝');
  assert.equal(s.skin, DEFAULT_SKIN);
  assert.ok(setSkin(s, SKIN_MAID), '女仆装可切换');
  assert.equal(s.skin, SKIN_MAID);
  assert.ok(setSkin(s, SKIN_BOWL), '饭盆头可切换');
  assert.equal(s.skin, SKIN_BOWL);
});

test('v0.15.0: 唯一角色鲸鱼娘免费，初始武器合法', () => {
  assert.equal(CHARACTERS.whale.unlockCost, 0, '鲸鱼娘默认免费');
  assert.ok(CHARACTERS.whale.weaponId && CHARACTERS.whale.weaponId.length > 0, '必须有初始武器');
  assert.equal(CHARACTERS.whale.mods.hp, 0);
  assert.equal(CHARACTERS.whale.mods.speedMult, 1);
  assert.ok(!CHARACTERS.fat && !CHARACTERS.eel, '胖鱼娘/电鳗娘已从角色表移除');
});

test('metaBonus: 强化等级按 maxRank 封顶且随等级提升', () => {
  const def = META_TREE.find(m => m.id === 'meta_atk')!;
  const s = sanitizeSave({ version: 3, gold: 0, meta: { meta_atk: 999 }, best: { time: 0, kills: 0, level: 0 }, unlocked: [DEFAULT_CHAR], charId: DEFAULT_CHAR, skin: DEFAULT_SKIN } as any);
  const b = metaBonus(s);
  assert.equal(b.damageMult, 1 + def.maxRank * 0.05, '越界等级封顶');
  assert.equal(b.maxHp, 0, '未点体能训练无加成');
  assert.equal(b.speedMult, 1);
});
