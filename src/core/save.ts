// 存档系统：localStorage 持久化局外成长（金币、永久强化等级、最佳记录、皮肤）
// 容错分两种：存储不可用 → 内存兜底；存档损坏 → 重置为默认，不崩游戏
//
// v0.14.0 存档结构升级到 v2：新增 unlocked[]（已解锁角色）、charId（当前角色）、skin。
// v0.15.0 存档结构 v3：
//  - 移除角色系统（仅保留鲸鱼娘）；旧 v2 存档中已解锁/选用的胖鱼娘/电鳗娘自动回落到鲸鱼娘；
//  - 已花金币解锁的玩家按 v0.14.0 解锁价退回金币（fat=400 / eel=800），金币/强化/最佳记录不丢。

const KEY = 'maidfish-survivor-save-v1';
import { META_TREE } from '../config/upgrades.ts';
import { DEFAULT_CHAR, DEFAULT_SKIN, isSkinId } from '../config/characters.ts';

export const SAVE_VERSION = 3;

export interface SaveData {
  version: number;                 // 当前 3
  gold: number;
  meta: Record<string, number>;    // metaId -> 等级
  best: { time: number; kills: number; level: number };
  unlocked: string[];              // v0.15.0 恒为 [whale]（角色系统已移除，字段保留兼容旧存档）
  charId: string;                  // v0.15.0 恒为 whale
  skin: string;                    // 当前皮肤（bowl / maid）
}

// v0.15.0：被移除角色的 v0.14.0 解锁价（曾解锁即代表已付费，迁移时退回）
const REMOVED_CHAR_REFUND: Record<string, number> = { fat: 400, eel: 800 };

function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    gold: 0,
    meta: {},
    best: { time: 0, kills: 0, level: 0 },
    unlocked: [DEFAULT_CHAR],
    charId: DEFAULT_CHAR,
    skin: DEFAULT_SKIN
  };
}

// v0.9.1: 存档字段只允许「有限非负整数」。1e309 在 JS 里是 Infinity，
// 小数/负数/NaN/超大值一律钳制，防止 stats 被 Infinity 污染或溢出。
function finiteNonNegInt(v: unknown, def: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : def;
  return Math.max(0, Math.floor(n));
}

// meta 等级同时受 META_TREE.maxRank 升级上限约束（越界存档直接封顶）
function sanitizeMeta(m: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!m || typeof m !== 'object') return out;
  for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
    const rank = finiteNonNegInt(v, 0);
    const def = META_TREE.find(x => x.id === k);
    out[k] = def ? Math.min(rank, def.maxRank) : rank;
  }
  return out;
}

// v0.15.0: 角色系统移除——unlocked 恒为 [whale]、charId 恒为 whale；
// 旧存档里的 fat/eel 由调用方在计算金币退款前记录，本函数只保证「合法回落」。
function sanitizeProgression(v: { unlocked?: unknown; charId?: unknown; skin?: unknown }): {
  unlocked: string[]; charId: string; skin: string;
} {
  return { unlocked: [DEFAULT_CHAR], charId: DEFAULT_CHAR, skin: isSkinId(v.skin) ? v.skin : DEFAULT_SKIN };
}

/** 每个字段都清洗为合法值，返回新对象（不污染调用方）。
 *  v0.15.0：旧存档若含已移除角色（fat/eel，代表 v0.14.0 花金币解锁过），
 *  在清洗前按解锁价退回金币（仅一次——清洗后 unlocked 不再含它们）。 */
export function sanitizeSave(data: Partial<SaveData>): SaveData {
  // 退款只认旧存档的原始 unlocked（含已移除角色 id）
  let refund = 0;
  if (Array.isArray(data.unlocked)) {
    for (const id of data.unlocked) {
      const cost = REMOVED_CHAR_REFUND[id];
      if (cost !== undefined) refund += cost;
    }
  }
  const prog = sanitizeProgression({ unlocked: data.unlocked, charId: data.charId, skin: data.skin });
  return {
    version: SAVE_VERSION,
    gold: finiteNonNegInt(data.gold, 0) + refund,
    meta: sanitizeMeta(data.meta),
    best: {
      time: finiteNonNegInt(data.best?.time, 0),
      kills: finiteNonNegInt(data.best?.kills, 0),
      level: finiteNonNegInt(data.best?.level, 0)
    },
    unlocked: prog.unlocked,
    charId: prog.charId,
    skin: prog.skin
  };
}

// 内存兜底（localStorage 完全不可用时使用）
let memoryFallback: SaveData | null = null;

export function loadSave(): SaveData {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch (e) {
    // 存储不可用（隐私模式等）→ 用内存兜底
    console.warn('[save] 存储不可用，使用内存存档', e);
    return memoryFallback ?? defaultSave();
  }

  if (!raw) return defaultSave();

  try {
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    // 逐字段合并，容忍旧存档缺字段；读取即清洗
    return sanitizeSave({
      version: parsed.version,
      gold: typeof parsed.gold === 'number' ? parsed.gold : 0,
      meta: parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {},
      best: {
        time: parsed.best?.time ?? 0,
        kills: parsed.best?.kills ?? 0,
        level: parsed.best?.level ?? 0
      },
      unlocked: parsed.unlocked,
      charId: parsed.charId,
      skin: parsed.skin
    });
  } catch (e) {
    // 存档损坏 → 重置为默认，避免带病运行
    console.warn('[save] 存档损坏，已重置为默认存档', e);
    return defaultSave();
  }
}

export function writeSave(data: SaveData): void {
  const clean = sanitizeSave(data);
  memoryFallback = clean;
  try {
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch (e) {
    console.warn('[save] 写入失败，仅保留在内存', e);
  }
}

// ---- v0.15.0 皮肤操作（角色系统已移除，仅剩皮肤切档）----

/** 切换皮肤：仅接受合法皮肤 id（免费、纯外观） */
export function setSkin(s: SaveData, skinId: string): boolean {
  if (!isSkinId(skinId)) return false;
  s.skin = skinId;
  return true;
}

// 汇总永久强化对基础属性的加成，供 GameScene 开局计算
// v0.9.1: rank 按 META_TREE.maxRank 封顶，Infinity/越界存档不会污染属性
export function metaBonus(data: SaveData) {
  const rank = (id: string) => {
    const r = data.meta[id] ?? 0;
    const def = META_TREE.find(m => m.id === id);
    return def ? Math.min(r, def.maxRank) : Math.max(0, r);
  };
  return {
    damageMult: 1 + rank('meta_atk') * 0.05,
    maxHp: rank('meta_hp') * 10,
    speedMult: 1 + rank('meta_spd') * 0.03,
    pickup: rank('meta_pick') * 12,
    critChance: rank('meta_crit') * 0.02,
    xpMult: 1 + rank('meta_xp') * 0.05
  };
}
