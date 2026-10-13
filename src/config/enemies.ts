// 敌人配置表：蓝色大肥鱼家族
// v0.10.0: Boss 血量固定不随 elapsed 缩放（Boss 是节奏事件，不是刷怪），提前到 150s 时玩家仍有可击败性。
export interface EnemyDef {
  id: string;
  name: string;
  texture: string;   // Boot 里生成的占位纹理 key
  hp: number;
  speed: number;     // px/s
  damage: number;    // 碰到玩家的伤害
  xp: number;        // 击杀经验
  goldChance: number;// 掉金币概率
  radius: number;    // 碰撞半径
  scale: number;     // 贴图缩放
}

export const ENEMIES: Record<string, EnemyDef> = {
  fish: {
    id: 'fish', name: '小蓝鱼', texture: 'enemy_fish',
    hp: 18, speed: 78, damage: 8, xp: 2, goldChance: 0.15, radius: 16, scale: 1
  },
  dart: {
    id: 'dart', name: '疾行鱼', texture: 'enemy_dart',
    hp: 15, speed: 170, damage: 6, xp: 3, goldChance: 0.2, radius: 12, scale: 0.85
  },
  fat: {
    id: 'fat', name: '肥鱼', texture: 'enemy_fat',
    hp: 60, speed: 50, damage: 15, xp: 7, goldChance: 0.5, radius: 26, scale: 1.4
  },
  boss: {
    id: 'boss', name: '蓝色大肥鱼王', texture: 'enemy_boss',
    hp: 2200, speed: 42, damage: 20, xp: 60, goldChance: 1, radius: 60, scale: 3
  }
};
