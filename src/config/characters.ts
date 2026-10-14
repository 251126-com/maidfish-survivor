// 角色与皮肤配置表：局外成长（Meta-Game）v0.14.0
// 角色差异 = 初始武器 + 基础属性偏移（在 PLAYER_BASE 之上、永久强化之前生效）。
// 皮肤纯外观切换，不影响数值。

export interface CharacterDef {
  id: string;
  name: string;
  desc: string;          // 一句话定位（角色选择卡展示）
  weaponId: string;      // 初始武器（必须存在于 WEAPONS）
  unlockCost: number;    // 解锁价格（金币，0 = 默认免费）
  mods: {
    hp: number;          // 相对 PLAYER_BASE.hp 的加减（可负）
    speedMult: number;   // 移速倍率（相对 PLAYER_BASE.speed）
    pickup: number;      // 拾取半径加减
    critChance: number;  // 暴击率加减（小数）
  };
  color: number;         // 角色卡主题色
  tag: string;           // 特性标签（简短，卡片上展示）
}

// 金币获取速率参照（v0.13.0）：普通怪 15~50% 掉 1 金币，12 分钟一局约 250~600 金。
// 解锁价：胖鱼娘 ~1.5 局，电鳗娘 ~2.5 局，节奏合理不肝不白送。
export const CHARACTERS: Record<string, CharacterDef> = {
  whale: {
    id: 'whale',
    name: '鲸鱼娘',
    desc: '深海咖啡馆的招牌店长，均衡全能',
    weaponId: 'rifle',
    unlockCost: 0,
    mods: { hp: 0, speedMult: 1, pickup: 0, critChance: 0 },
    color: 0x4a9fe8,
    tag: '均衡 · 步枪'
  },
  fat: {
    id: 'fat',
    name: '胖鱼娘',
    desc: '饭量惊人的大胃王，皮糙肉厚冲进怪堆',
    weaponId: 'shotgun',
    unlockCost: 400,
    mods: { hp: 50, speedMult: 0.85, pickup: 40, critChance: 0 },
    color: 0xff9a5c,
    tag: '高血量 · 低移速 · 霰弹枪'
  },
  eel: {
    id: 'eel',
    name: '电鳗娘',
    desc: '深海放电小妹妹，快进快出脆皮游走',
    weaponId: 'eel',
    unlockCost: 800,
    mods: { hp: -30, speedMult: 1.18, pickup: 20, critChance: 0.05 },
    color: 0x9a6ff0,
    tag: '低血量 · 高移速 · 电鳗枪'
  }
};

// 展示顺序（默认角色恒在第一位）
export const CHARACTER_ORDER: string[] = ['whale', 'fat', 'eel'];
export const DEFAULT_CHAR = 'whale';

// ---- 皮肤 ----
export const SKIN_BOWL = 'bowl';    // 饭盆头（可切换）
export const SKIN_MAID = 'maid';    // 女仆装（默认）
export const SKIN_ORDER = [SKIN_MAID, SKIN_BOWL] as const;
export type SkinId = typeof SKIN_ORDER[number];
export const DEFAULT_SKIN = SKIN_MAID;

export interface SkinDef {
  id: SkinId;
  name: string;
  desc: string;
}

export const SKINS: Record<SkinId, SkinDef> = {
  [SKIN_MAID]: { id: SKIN_MAID, name: '女仆装', desc: '正常卖萌形态 · 深海咖啡馆招牌店长' },
  [SKIN_BOWL]: { id: SKIN_BOWL, name: '饭盆头', desc: '头上扣铁饭盆 · 深海干饭魂（搞笑形态）' }
};

export function isSkinId(v: unknown): v is SkinId {
  return typeof v === 'string' && (SKIN_ORDER as readonly string[]).includes(v);
}

export function isCharacterId(v: unknown): v is string {
  return typeof v === 'string' && !!CHARACTERS[v];
}
