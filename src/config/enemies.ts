// 敌人配置表：蓝色大肥鱼家族 + v0.11.0 深海小怪
// v0.10.0: Boss 血量固定不随 elapsed 缩放（Boss 是节奏事件，不是刷怪），提前到 150s 时玩家仍有可击败性。
// v0.11.0: 新增两种带独立移动模式的深海小怪：
//   - jelly  水母：慢速漂浮 + 周期性「麻痹圈」（预警蓄圈后炸一圈，命中=伤害+减速）
//   - lantern 灯笼鱼：平时慢速逼近，每隔几秒朝玩家当前位置直线冲刺一段
export interface EnemyDef {
  id: string;
  name: string;
  texture: string;   // Boot 里生成的占位纹理 key
  hp: number;
  speed: number;     // px/s（追踪/漂浮基准速度）
  damage: number;    // 碰到玩家的伤害
  xp: number;        // 击杀经验
  goldChance: number;// 掉金币概率
  radius: number;    // 碰撞半径
  scale: number;     // 贴图缩放
  // v0.12.0 精英：稀有出场（不混普通怪海）、体型放大、发光边框、出场时屏幕边缘闪光
  elite?: boolean;
  eliteScale?: number;  // 精英体型倍率（默认 1.6）
  move?: 'chase' | 'float' | 'dash';  // v0.11.0 移动模式：默认 chase（直线追踪）
  // 水母麻痹圈：interval 间隔 / telegraph 预警时长 / radius 圈半径 / damage 命中伤害
  aura?: { interval: number; telegraph: number; radius: number; damage: number; slowFactor: number; slowDur: number };
  // 灯笼鱼冲刺：cd 冲刺间隔 / dur 冲刺持续 / speed 冲刺速度
  dash?: { cd: number; dur: number; speed: number };
}

export const ENEMIES: Record<string, EnemyDef> = {
  fish: {
    id: 'fish', name: '小蓝鱼', texture: 'enemy_fish',
    hp: 18, speed: 78, damage: 8, xp: 3, goldChance: 0.15, radius: 16, scale: 1
  },
  dart: {
    id: 'dart', name: '疾行鱼', texture: 'enemy_dart',
    hp: 15, speed: 170, damage: 6, xp: 4, goldChance: 0.2, radius: 12, scale: 0.85
  },
  fat: {
    id: 'fat', name: '肥鱼', texture: 'enemy_fat',
    hp: 60, speed: 50, damage: 15, xp: 9, goldChance: 0.5, radius: 26, scale: 1.4
  },
  // v0.12.0 水母·精英：漂浮逼近 + 周期性蓄「麻痹圈」（机制保留，从普通怪转为稀有精英）
  jelly: {
    id: 'jelly', name: '水母', texture: 'enemy_jelly',
    hp: 60, speed: 46, damage: 12, xp: 24, goldChance: 0.5, radius: 20, scale: 1,
    elite: true, eliteScale: 1.6,
    move: 'float',
    aura: { interval: 4.2, telegraph: 1.1, radius: 130, damage: 10, slowFactor: 0.5, slowDur: 1.6 }
  },
  // v0.12.0 灯笼鱼·精英：慢速逼近 + 周期直线冲刺（机制保留）
  lantern: {
    id: 'lantern', name: '灯笼鱼', texture: 'enemy_lantern',
    hp: 52, speed: 76, damage: 13, xp: 22, goldChance: 0.5, radius: 15, scale: 1,
    elite: true, eliteScale: 1.6,
    move: 'dash',
    dash: { cd: 4.5, dur: 0.55, speed: 520 }
  },
  boss: {
    id: 'boss', name: '蓝色大肥鱼王', texture: 'enemy_boss',
    hp: 2200, speed: 42, damage: 20, xp: 80, goldChance: 1, radius: 60, scale: 3
  }
};
