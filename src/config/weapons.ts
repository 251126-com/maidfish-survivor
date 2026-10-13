// 武器配置表：数据驱动。加武器只改这里，不动系统代码
// evolved=true 的武器只能通过"进化"获得，不会出现在新武器候选里
// v0.12.0 新增：mutations（质变分支）——武器达 Lv3 后升级池出现金色边框的质变卡，
// 一把武器同时只能携带一个质变（金色高权重），与普通升级卡在池中共存。

export interface WeaponLevelDef {
  damage: number;    // 单发伤害
  cooldown: number;  // 开火间隔（秒）
  count: number;     // 弹道数量
  pierce: number;    // 穿透数
  speed: number;     // 弹速 px/s（环绕武器为角速度）
  range: number;     // 射程/环绕半径 px
  splash?: number;   // 溅射半径 px（命中后对周围敌人造成范围伤害）
  spread?: number;   // v0.11.0 多发时的扇形间隔（弧度），默认 0.14
  life?: number;     // v0.11.0 子弹寿命（秒），默认 2（霰弹枪短射程用）
  knockMult?: number;// v0.12.0 击退倍率（泡泡枪/击退弹用，默认 1）
  chain?: number;    // v0.12.0 电鳗：连锁闪电最大目标数
  chainRadius?: number; // v0.12.0 电鳗：相邻跳链搜索半径 px
  tick?: number;     // v0.12.0 激光：每次结算伤害间隔（秒）
}

export interface MutationDef {
  id: string;
  name: string;
  desc: string;
  mod: 'pierce' | 'explosive' | 'bounce' | 'burn' | 'freeze' | 'knockback' | 'count' | 'chain' | 'splash' | 'laserFocus' | 'laserRange';
  params?: Record<string, number>;
}

export interface WeaponDef {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  levels: WeaponLevelDef[];   // 索引 0 = 1级
  evolved?: boolean;          // 进化武器：不可从升级池直接获取
  beam?: boolean;             // v0.12.0 持续光束类（深海激光）：不走弹道池
  mutations?: MutationDef[];  // v0.12.0 质变分支（Lv3+ 进升级池，金色高权重）
  // 进化配方：本武器满级 + 持有 requiredPassive 时，升级池出现进化选项
  evolution?: { requiredPassive: string; evolvesTo: string };
}

export const WEAPONS: Record<string, WeaponDef> = {
  rifle: {
    id: 'rifle',
    name: '制式步枪',
    desc: '自动射击最近的敌人',
    maxLevel: 5,
    levels: [
      { damage: 12, cooldown: 0.42, count: 1, pierce: 1, speed: 750, range: 700 },
      { damage: 14, cooldown: 0.42, count: 1, pierce: 1, speed: 750, range: 700 },
      { damage: 14, cooldown: 0.38, count: 2, pierce: 1, speed: 780, range: 720 },
      { damage: 18, cooldown: 0.34, count: 2, pierce: 2, speed: 800, range: 740 },
      { damage: 22, cooldown: 0.30, count: 3, pierce: 2, speed: 820, range: 760 }
    ],
    // v0.12.0 质变分支：穿透弹 / 爆炸弹 / 弹射弹
    mutations: [
      { id: 'rifle_pierce', name: '质变·穿透弹', desc: '穿透 +2，伤害 ×0.9', mod: 'pierce', params: { pierce: 2, dmgMult: 0.9 } },
      { id: 'rifle_explosive', name: '质变·爆炸弹', desc: '命中爆炸半径 70，伤害 ×0.75', mod: 'explosive', params: { radius: 70, dmgMult: 0.75 } },
      { id: 'rifle_bounce', name: '质变·弹射弹', desc: '耗尽穿透后弹向附近敌人 ×2', mod: 'bounce', params: { count: 2, range: 300 } }
    ],
    evolution: { requiredPassive: 'scope', evolvesTo: 'railgun' }
  },
  sniper: {
    id: 'sniper',
    name: '大肥鱼狙击枪',
    desc: '高伤慢速，贯穿一排',
    maxLevel: 5,
    levels: [
      { damage: 40, cooldown: 1.8, count: 1, pierce: 6, speed: 1100, range: 1100 },
      { damage: 55, cooldown: 1.7, count: 1, pierce: 6, speed: 1100, range: 1100 },
      { damage: 55, cooldown: 1.5, count: 1, pierce: 8, speed: 1150, range: 1150 },
      { damage: 70, cooldown: 1.4, count: 1, pierce: 8, speed: 1200, range: 1200 },
      { damage: 90, cooldown: 1.2, count: 2, pierce: 10, speed: 1200, range: 1250 }
    ],
    evolution: { requiredPassive: 'maidband', evolvesTo: 'fatfishCannon' }
  },
  tail: {
    id: 'tail',
    name: '尾鳍回旋',
    desc: '尾鳍环绕自身，扫开近身敌人',
    maxLevel: 5,
    levels: [
      { damage: 12, cooldown: 0.5, count: 2, pierce: 99, speed: 2.4, range: 90 },
      { damage: 16, cooldown: 0.5, count: 2, pierce: 99, speed: 2.6, range: 100 },
      { damage: 16, cooldown: 0.45, count: 3, pierce: 99, speed: 2.8, range: 110 },
      { damage: 20, cooldown: 0.45, count: 3, pierce: 99, speed: 3.0, range: 120 },
      { damage: 26, cooldown: 0.4, count: 4, pierce: 99, speed: 3.2, range: 135 }
    ]
    // 无进化、无质变：纯数值成长路线（近身割草定位，保持简单）
  },

  // ===== v0.11.0 霰弹枪：近距离扇形喷射 =====
  shotgun: {
    id: 'shotgun',
    name: '深海霰弹枪',
    desc: '近距离扇形喷射，贴脸高伤',
    maxLevel: 5,
    levels: [
      { damage: 9,  cooldown: 0.85, count: 6,  pierce: 1, speed: 680, range: 280, spread: 0.32, life: 0.42 },
      { damage: 10, cooldown: 0.82, count: 7,  pierce: 1, speed: 680, range: 290, spread: 0.34, life: 0.43 },
      { damage: 10, cooldown: 0.78, count: 8,  pierce: 1, speed: 690, range: 300, spread: 0.36, life: 0.44 },
      { damage: 12, cooldown: 0.74, count: 9,  pierce: 2, speed: 700, range: 310, spread: 0.38, life: 0.45 },
      { damage: 14, cooldown: 0.68, count: 10, pierce: 2, speed: 710, range: 320, spread: 0.40, life: 0.46 }
    ],
    // v0.12.0 质变分支：燃烧弹 / 冰冻弹 / 击退弹
    mutations: [
      { id: 'sg_burn', name: '质变·燃烧弹', desc: '命中附加灼烧 1.6s（每秒 10 伤）', mod: 'burn', params: { dps: 10, dur: 1.6 } },
      { id: 'sg_freeze', name: '质变·冰冻弹', desc: '命中减速 50% × 1.2s', mod: 'freeze', params: { factor: 0.5, dur: 1.2 } },
      { id: 'sg_knock', name: '质变·击退弹', desc: '击退力度 ×2.2', mod: 'knockback', params: { mult: 2.2 } }
    ]
    // 无进化：纯数值成长路线
  },

  // ===== v0.12.0 新武器：珊瑚弩（穿透直线慢速） =====
  coral: {
    id: 'coral',
    name: '珊瑚弩',
    desc: '慢速直线箭矢，贯穿一排',
    maxLevel: 5,
    levels: [
      { damage: 42, cooldown: 0.9,  count: 1, pierce: 5, speed: 430, range: 950, life: 2.3 },
      { damage: 48, cooldown: 0.86, count: 1, pierce: 5, speed: 440, range: 950, life: 2.3 },
      { damage: 48, cooldown: 0.80, count: 1, pierce: 7, speed: 450, range: 980, life: 2.3 },
      { damage: 58, cooldown: 0.74, count: 1, pierce: 7, speed: 470, range: 1000, life: 2.3 },
      { damage: 68, cooldown: 0.66, count: 2, pierce: 8, speed: 480, range: 1050, life: 2.3 }
    ],
    mutations: [
      { id: 'coral_poison', name: '质变·珊瑚毒刺', desc: '命中附加灼烧 1.8s（每秒 8 伤）', mod: 'burn', params: { dps: 8, dur: 1.8 } },
      { id: 'coral_fork', name: '质变·分叉箭', desc: '同时射出 2 支箭（伤害 ×0.75）', mod: 'count', params: { count: 2, dmgMult: 0.75 } }
    ]
  },

  // ===== v0.12.0 新武器：电鳗发射器（连锁闪电自动索敌） =====
  eel: {
    id: 'eel',
    name: '电鳗发射器',
    desc: '闪电自动索敌，连锁跳向下一个敌人',
    maxLevel: 5,
    levels: [
      { damage: 20, cooldown: 0.85, count: 1, pierce: 0, speed: 0, range: 430, chain: 3, chainRadius: 170 },
      { damage: 24, cooldown: 0.80, count: 1, pierce: 0, speed: 0, range: 450, chain: 3, chainRadius: 175 },
      { damage: 24, cooldown: 0.72, count: 1, pierce: 0, speed: 0, range: 470, chain: 4, chainRadius: 180 },
      { damage: 30, cooldown: 0.64, count: 1, pierce: 0, speed: 0, range: 490, chain: 4, chainRadius: 190 },
      { damage: 36, cooldown: 0.55, count: 1, pierce: 0, speed: 0, range: 520, chain: 5, chainRadius: 200 }
    ],
    mutations: [
      { id: 'eel_chain', name: '质变·电弧增强', desc: '链数 +1，伤害 ×1.15', mod: 'chain', params: { chain: 1, dmgMult: 1.15 } },
      { id: 'eel_emp', name: '质变·电磁暴', desc: '每次命中爆炸半径 55（伤害 ×0.85）', mod: 'explosive', params: { radius: 55, dmgMult: 0.85 } }
    ]
  },

  // ===== v0.12.0 新武器：泡泡枪（大范围低伤击退） =====
  bubble: {
    id: 'bubble',
    name: '泡泡枪',
    desc: '大泡泡命中爆开，低伤大范围击退',
    maxLevel: 5,
    levels: [
      { damage: 9,  cooldown: 0.55, count: 1, pierce: 1, speed: 330, range: 460, splash: 95, life: 1.5, knockMult: 2.0 },
      { damage: 10, cooldown: 0.52, count: 1, pierce: 1, speed: 340, range: 470, splash: 100, life: 1.5, knockMult: 2.0 },
      { damage: 10, cooldown: 0.48, count: 1, pierce: 1, speed: 350, range: 480, splash: 105, life: 1.5, knockMult: 2.1 },
      { damage: 12, cooldown: 0.44, count: 1, pierce: 1, speed: 360, range: 490, splash: 110, life: 1.5, knockMult: 2.1 },
      { damage: 14, cooldown: 0.40, count: 2, pierce: 1, speed: 370, range: 500, splash: 115, life: 1.5, knockMult: 2.2 }
    ],
    mutations: [
      { id: 'bubble_big', name: '质变·巨型泡泡', desc: '爆炸半径 +45', mod: 'splash', params: { radius: 45 } },
      { id: 'bubble_jet', name: '质变·高压水泡', desc: '击退力度 ×1.6', mod: 'knockback', params: { mult: 1.6 } }
    ]
  },

  // ===== v0.12.0 新武器：深海激光（持续光束自动锁定最近敌人） =====
  laser: {
    id: 'laser',
    name: '深海激光',
    desc: '持续光束锁定最近敌人，自动灼烧',
    maxLevel: 5,
    beam: true,
    levels: [
      { damage: 16, cooldown: 0, count: 1, pierce: 0, speed: 0, range: 500, tick: 0.14 },
      { damage: 19, cooldown: 0, count: 1, pierce: 0, speed: 0, range: 520, tick: 0.13 },
      { damage: 19, cooldown: 0, count: 1, pierce: 0, speed: 0, range: 540, tick: 0.12 },
      { damage: 24, cooldown: 0, count: 1, pierce: 0, speed: 0, range: 560, tick: 0.11 },
      { damage: 29, cooldown: 0, count: 1, pierce: 0, speed: 0, range: 580, tick: 0.10 }
    ],
    mutations: [
      { id: 'laser_focus', name: '质变·聚焦', desc: '伤害 ×1.25（射程不变）', mod: 'laserFocus', params: { dmgMult: 1.25 } },
      { id: 'laser_range', name: '质变·长光束', desc: '射程 +160', mod: 'laserRange', params: { range: 160 } }
    ]
  },

  // ===== 进化武器（仅通过进化获得）=====
  railgun: {
    id: 'railgun',
    name: '鲸波轨道枪',
    desc: '进化：穿透一切，射速拉满',
    maxLevel: 1,
    evolved: true,
    levels: [
      { damage: 52, cooldown: 0.20, count: 1, pierce: 999, speed: 1700, range: 950 }
    ]
  },
  fatfishCannon: {
    id: 'fatfishCannon',
    name: '大肥鱼炮',
    desc: '进化：命中后炸开一片',
    maxLevel: 1,
    evolved: true,
    levels: [
      { damage: 105, cooldown: 1.0, count: 1, pierce: 3, speed: 820, range: 900, splash: 110 }
    ]
  }
};

// 升级池用：可正常获取的武器（排除进化武器）
export const OBTAINABLE_WEAPONS = Object.values(WEAPONS).filter(w => !w.evolved);
