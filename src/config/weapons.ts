// 武器配置表：数据驱动。加武器只改这里，不动系统代码
// evolved=true 的武器只能通过"进化"获得，不会出现在新武器候选里

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
}

export interface WeaponDef {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  levels: WeaponLevelDef[];   // 索引 0 = 1级
  evolved?: boolean;          // 进化武器：不可从升级池直接获取
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
    // 无进化：纯数值成长路线
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
    ]
    // 无进化：纯数值成长路线
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