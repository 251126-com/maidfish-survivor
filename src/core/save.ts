// 存档系统：localStorage 持久化局外成长（金币、永久强化等级、最佳记录）
// 容错分两种：存储不可用 → 内存兜底；存档损坏 → 重置为默认，不崩游戏

const KEY = 'maidfish-survivor-save-v1';

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
    // 逐字段合并，容忍旧存档缺字段
    return {
      version: base.version,
      gold: typeof parsed.gold === 'number' ? parsed.gold : 0,
      meta: parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {},
      best: {
        time: parsed.best?.time ?? 0,
        kills: parsed.best?.kills ?? 0,
        level: parsed.best?.level ?? 0
      }
    };
  } catch (e) {
    // 存档损坏 → 重置为默认，避免带病运行
    console.warn('[save] 存档损坏，已重置为默认存档', e);
    return defaultSave();
  }
}

export function writeSave(data: SaveData): void {
  memoryFallback = data;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('[save] 写入失败，仅保留在内存', e);
  }
}

// 汇总永久强化对基础属性的加成，供 GameScene 开局计算
export function metaBonus(data: SaveData) {
  const rank = (id: string) => data.meta[id] ?? 0;
  return {
    damageMult: 1 + rank('meta_atk') * 0.05,
    maxHp: rank('meta_hp') * 10,
    speedMult: 1 + rank('meta_spd') * 0.03,
    pickup: rank('meta_pick') * 12,
    critChance: rank('meta_crit') * 0.02,
    xpMult: 1 + rank('meta_xp') * 0.05
  };
}