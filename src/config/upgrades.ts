// 升级池与永久强化表

// ---- 局内三选一：属性 Buff ----
export interface BuffDef {
  id: string;
  name: string;
  desc: string;
  apply: (p: PlayerStats) => void;
}

// 玩家属性结构（局内实时值，永久强化已合入）
export interface PlayerStats {
  maxHp: number; hp: number;
  speed: number; pickup: number;
  critChance: number; critMult: number;
  damageMult: number; xpMult: number;
}

export const BUFF_POOL: BuffDef[] = [
  { id: 'atk',   name: '锋利弹药', desc: '全局伤害 +10%',
    apply: p => { p.damageMult += 0.10; } },
  { id: 'hp',    name: '大白饭', desc: '饱餐一顿：上限+20，回复20生命',
    apply: p => { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); } },
  { id: 'spd',   name: '轻快步伐', desc: '移速 +8%',
    apply: p => { p.speed *= 1.08; } },
  { id: 'pick',  name: '磁力领结', desc: '拾取范围 +25',
    apply: p => { p.pickup += 25; } },
  { id: 'crit',  name: '瞄准直觉', desc: '暴击率 +5%',
    apply: p => { p.critChance += 0.05; } },
  { id: 'xp',    name: '学霸头脑', desc: '经验获取 +10%',
    apply: p => { p.xpMult += 0.10; } }
];

// ---- 被动道具：进化配方的钥匙，本身也有数值收益 ----
export interface PassiveDef {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  apply: (p: PlayerStats) => void;
}

export const PASSIVES: Record<string, PassiveDef> = {
  scope: {
    id: 'scope', name: '瞄准镜', desc: '伤害 +8%（步枪进化钥匙）', maxLevel: 5,
    apply: p => { p.damageMult += 0.08; }
  },
  maidband: {
    id: 'maidband', name: '女仆头饰', desc: '经验 +10%（狙击枪进化钥匙）', maxLevel: 5,
    apply: p => { p.xpMult += 0.10; }
  }
};

// ---- 局外永久强化（金币购买，存档保留）----
export interface MetaDef {
  id: string;
  name: string;
  desc: string;
  maxRank: number;
  cost: (rank: number) => number;   // rank 从 0 开始，返回升到下一级的价格
}

export const META_TREE: MetaDef[] = [
  { id: 'meta_atk',  name: '攻击强化', desc: '每级伤害 +5%',   maxRank: 10, cost: r => 100 + r * 80 },
  { id: 'meta_hp',   name: '体能训练', desc: '每级生命 +10',   maxRank: 10, cost: r => 80 + r * 60 },
  { id: 'meta_spd',  name: '疾走特训', desc: '每级移速 +3%',   maxRank: 8,  cost: r => 120 + r * 90 },
  { id: 'meta_pick', name: '引力改造', desc: '每级拾取 +12',   maxRank: 8,  cost: r => 60 + r * 50 },
  { id: 'meta_crit', name: '弱点狙击', desc: '每级暴击 +2%',   maxRank: 5,  cost: r => 150 + r * 120 },
  { id: 'meta_xp',   name: '经验心得', desc: '每级经验 +5%',   maxRank: 10, cost: r => 90 + r * 70 }
];