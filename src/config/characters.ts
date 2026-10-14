// 角色与皮肤配置表：局外成长（Meta-Game）v0.15.0
// v0.15.0：移除多角色系统——只保留鲸鱼娘（默认/唯一角色）。
// 不再有胖鱼娘/电鳗娘；旧存档中已解锁/选用的其他角色自动回落到鲸鱼娘，
// 已花费的金币按 v0.14.0 解锁价退回（见 save.ts 迁移逻辑，金币强化不丢）。
// 皮肤纯外观切换，不影响数值。

export interface CharacterDef {
  id: string;
  name: string;
  desc: string;          // 一句话定位（大厅展示）
  weaponId: string;      // 初始武器（必须存在于 WEAPONS）
  unlockCost: number;    // 解锁价格（金币，0 = 默认免费）
  mods: {
    hp: number;          // 相对 PLAYER_BASE.hp 的加减（可负）
    speedMult: number;   // 移速倍率（相对 PLAYER_BASE.speed）
    pickup: number;      // 拾取半径加减
    critChance: number;  // 暴击率加减（小数）
  };
  color: number;         // 主题色
  tag: string;           // 特性标签
}

// v0.15.0：仅鲸鱼娘（均衡全能，初始步枪）。CHARACTER_ORDER 仅一项，角色卡入口已删除。
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
  }
};

// 展示顺序（唯一角色恒在第一位）
export const CHARACTER_ORDER: string[] = ['whale'];
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
