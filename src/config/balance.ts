// 全局数值配置：所有可调参数集中在这里，改数值不动代码
export const GAME_W = 1280;
export const GAME_H = 720;

// 世界大小（有限场地，相机跟随玩家）
export const WORLD_W = 4000;
export const WORLD_H = 4000;

// 单局时长与 Boss 触发点（秒）
export const GAME_DURATION = 12 * 60;
// v0.10.0: Boss 从 600s 提前到 150s（120~180s 区间），普通玩家一局内必然能看到。
// 保留完整三技能预警：Boss 出现更早，但血量固定不随时间膨胀（见 enemySystem.spawn）。
export const BOSS_TIME = 150;
// Boss 登场前预警横幅的提前量（秒）
export const BOSS_WARN_TIME = 5;

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

// 升级所需经验：need(level) = floor(4 + level*8 + level^2 * 1.2)
// v0.11.0: 首次升级门槛再降到 13（v0.10 为 14）、2级 24、3级 38——
// 配合 3xp/只的击杀经验与开局波次，首次升级稳定落在 15~20s；前 2 分钟连升数级成长感明显。
// 后段增速放缓（level^2 系数 1.2），避免中期升级越来越漫长导致成长反馈断裂。
export function xpNeed(level: number): number {
  return Math.floor(4 + level * 8 + level * level * 1.2);
}

// 性能预算：硬上限，超出不再生成（对象池会复用）
export const POOL_LIMIT = {
  enemy: 300,
  bullet: 400,
  gem: 200,
  damageText: 40,
  enemyBullet: 120,   // v0.9.0 Boss 弹幕（扇弹）池
  deathFx: 160        // v0.10.0 击杀爆散粒子池（克制数量，复用不新建）
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
// v0.10.0 开局护盾：新对局自带 20 点护甲（半份饭盆）。
// 前 60s 容错——30s 前后不再一被围就快速掉光 HP；拾取饭盆仍可补满到 ARMOR_MAX。
export const STARTER_ARMOR = 20;
