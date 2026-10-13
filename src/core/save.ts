// 存档系统：localStorage 持久化局外成长（金币、永久强化等级、最佳记录）
// 容错分两种：存储不可用 → 内存兜底；存档损坏 → 重置为默认，不崩游戏

const KEY = 'maidfish-survivor-save-v1';
import { META_TREE } from '../config/upgrades.ts';

export interface SaveData {
  version: number;
  gold: number;
  meta: Record<string, number>;   // metaId -> 等级
  best: { time: number; kills: number; level: number };
}

function defaultSave(): SaveData {
  return {
    version: 1,
    gold: 0,
    meta: {},
    best: { time: 0, kills: 0, level: 0 }
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

/** 每个字段都清洗为有限非负整数，返回新对象（不污染调用方） */
export function sanitizeSave(data: SaveData): SaveData {
  return {
    version: 1,
    gold: finiteNonNegInt(data.gold, 0),
    meta: sanitizeMeta(data.meta),
    best: {
      time: finiteNonNegInt(data.best?.time, 0),
      kills: finiteNonNegInt(data.best?.kills, 0),
      level: finiteNonNegInt(data.best?.level, 0)
    }
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
    const base = defaultSave();
    // 逐字段合并，容忍旧存档缺字段；读取即清洗（有限非负整数 + 升级上限）
    return sanitizeSave({
      version: base.version,
      gold: typeof parsed.gold === 'number' ? parsed.gold : 0,
      meta: parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {},
      best: {
        time: parsed.best?.time ?? 0,
        kills: parsed.best?.kills ?? 0,
        level: parsed.best?.level ?? 0
      }
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