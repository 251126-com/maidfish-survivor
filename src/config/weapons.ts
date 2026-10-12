// 武器配置表：数据驱动。加武器只改这里，不动系统代码
// 进化配方已预留（evolution 字段），第二期实现合成

export interface WeaponLevelDef {
  damage: number;    // 单发伤害
  cooldown: number;  // 开火间隔（秒）
  count: number;     // 弹道数量
  pierce: number;    // 穿透数
  speed: number;     // 弹速 px/s（环绕武器为角速度）
  range: number;     // 射程/环绕半径 px
}

export interface WeaponDef {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  levels: WeaponLevelDef[];   // 索引 0 = 1级
  // 进化（第二期）：满级 + 持有 requiredPassive 时，升级直接替换为 evolvesTo
  evolution?: { requiredPassive: string; evolvesTo: string };
}

export const WEAPONS: Record<string, WeaponDef> = {
  rifle: {
    id: 'rifle',
    name: '制式步枪',
    desc: '自动射击最近的敌人',
    maxLevel: 5,
    levels: [
      { damage: 10, cooldown: 0.45, count: 1, pierce: 1, speed: 750, range: 700 },
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
    name: '鲨尾回旋',
    desc: '尾鳍环绕自身，扫开近身敌人',
    maxLevel: 5,
    levels: [
      { damage: 12, cooldown: 0.5, count: 2, pierce: 99, speed: 2.4, range: 90 },
      { damage: 16, cooldown: 0.5, count: 2, pierce: 99, speed: 2.6, range: 100 },
      { damage: 16, cooldown: 0.45, count: 3, pierce: 99, speed: 2.8, range: 110 },
      { damage: 20, cooldown: 0.45, count: 3, pierce: 99, speed: 3.0, range: 120 },
      { damage: 26, cooldown: 0.4, count: 4, pierce: 99, speed: 3.2, range: 135 }
    ]
    // 鲨尾无进化，留纯数值线
  }
};
