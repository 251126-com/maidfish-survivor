// 特殊掉落（大白饭 / 饭盆）纯逻辑：极低概率 + 可注入随机源 + 回血钳制。
import { RICE_DROP_CHANCE, BOWL_DROP_CHANCE, RICE_HEAL } from '../config/balance.ts';

export type CollectibleKind = 'rice' | 'bowl';

// 打怪后掷一次：先判更低概率的饭盆，再判大白饭。返回要掉落的特殊物品。
// rng 可注入便于确定性测试（e2e/单测都依赖这一点）。
export function rollSpecialDrop(rng: () => number = Math.random): CollectibleKind | null {
  const r = rng();
  if (r < BOWL_DROP_CHANCE) return 'bowl';
  if (r < BOWL_DROP_CHANCE + RICE_DROP_CHANCE) return 'rice';
  return null;
}

// 回血钳制：绝不超最大 HP
export function healClamp(hp: number, maxHp: number, amount: number): number {
  return Math.min(maxHp, hp + amount);
}

export { RICE_DROP_CHANCE, BOWL_DROP_CHANCE, RICE_HEAL };
