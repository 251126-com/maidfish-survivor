// 敌人配置表：蓝色大肥鱼家族
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
    hp: 20, speed: 75, damage: 8, xp: 1, goldChance: 0.15, radius: 16, scale: 1
  },
  dart: {
    id: 'dart', name: '疾行鱼', texture: 'enemy_dart',
    hp: 15, speed: 170, damage: 6, xp: 2, goldChance: 0.2, radius: 12, scale: 0.85
  },
  fat: {
    id: 'fat', name: '肥鱼', texture: 'enemy_fat',
    hp: 70, speed: 48, damage: 15, xp: 5, goldChance: 0.5, radius: 26, scale: 1.4
  },
  boss: {
    id: 'boss', name: '蓝色大肥鱼王', texture: 'enemy_boss',
    hp: 4000, speed: 42, damage: 25, xp: 100, goldChance: 1, radius: 60, scale: 3
  }
};
