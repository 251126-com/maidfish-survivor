// 存档系统：localStorage 持久化局外成长（金币、永久强化等级、最佳记录）
// 容错：隐私模式/禁用存储时降级到内存，不崩游戏

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

// 内存兜底（localStorage 不可用时）
let memoryFallback: SaveData | null = null;

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
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
    console.warn('[save] 读取失败，使用默认存档', e);
    return memoryFallback ?? defaultSave();
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