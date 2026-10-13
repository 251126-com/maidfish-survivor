// 全局数值配置：所有可调参数集中在这里，改数值不动代码
export const GAME_W = 1280;
export const GAME_H = 720;

// 世界大小（有限场地，相机跟随玩家）
export const WORLD_W = 4000;
export const WORLD_H = 4000;

// 单局时长与 Boss 触发点（秒）
export const GAME_DURATION = 12 * 60;
export const BOSS_TIME = 10 * 60;

// 玩家基础属性（永久强化在此基础上加成）
export const PLAYER_BASE = {
  hp: 100,
  speed: 230,        // px/s
  pickup: 80,        // 拾取半径 px
  critChance: 0.05,  // 暴击率
  critMult: 2.0,     // 暴击倍率
  damageMult: 1.0,   // 全局伤害倍率
  xpMult: 1.0        // 经验倍率
};

// 升级所需经验：need(level) = floor(5 + level*10 + level^2 * 2)
export function xpNeed(level: number): number {
  return Math.floor(5 + level * 10 + level * level * 2);
}

// 性能预算：硬上限，超出不再生成（对象池会复用）
export const POOL_LIMIT = {
  enemy: 300,
  bullet: 400,
  gem: 200,
  damageText: 40,
  enemyBullet: 120   // v0.9.0 Boss 弹幕（扇弹）池
};

// 敌人属性随时间成长：每分钟 +35% 生命，+3% 移速（封顶）
export function hpScale(elapsedSec: number): number {
  return 1 + (elapsedSec / 60) * 0.35;
}
export function speedScale(elapsedSec: number): number {
  return Math.min(1.5, 1 + (elapsedSec / 60) * 0.03);
}

// ---- 特殊掉落（大白饭/饭盆）----
// 常量可调：默认极小概率。饭 1.5%，饭盆 0.35%（比金币掉落还稀有）。
export const RICE_DROP_CHANCE = 0.015;    // 打怪掉大白饭概率
export const BOWL_DROP_CHANCE = 0.0035;   // 打怪掉饭盆概率（更稀有）
export const RICE_HEAL = 20;              // 拾取大白饭回复生命
export const ARMOR_MAX = 30;              // 饭盆护甲上限/耐久
