// 护甲系统：纯逻辑、可单测。饭盆护甲有独立状态与耐久。
// 设计：
//  - 拾取饭盆 → 获得/刷新到满耐久（多次拾取不叠加超上限，只刷新）。
//  - 受伤优先扣护甲；溢出伤害落到 HP；护甲归零时 broken=true，
//    由表现层据此恢复原始角色立绘并播放破碎反馈。
import { ARMOR_MAX } from '../config/balance.ts';
export { ARMOR_MAX };

export interface ArmorState {
  armor: number;   // 当前护甲耐久
  max: number;     // 护甲上限（默认 30）
}

export function emptyArmor(max: number = ARMOR_MAX): ArmorState {
  return { armor: 0, max };
}

export function hasArmor(s: ArmorState): boolean {
  return s.armor > 0;
}

/** 有护甲时角色显示饭盆头版本 */
export function shouldShowBowl(s: ArmorState): boolean {
  return hasArmor(s);
}

// 拾取饭盆：'new' 首次获得 / 'refill' 刷新回满 / 'full' 已满无变化
export function applyBowlPickup(s: ArmorState, max: number = ARMOR_MAX): 'new' | 'refill' | 'full' {
  if (s.armor <= 0) {
    s.armor = max;
    s.max = max;
    return 'new';
  }
  if (s.armor < max) {
    s.armor = max;
    s.max = max;
    return 'refill';
  }
  return 'full';
}

// 受伤：护甲优先吸收。返回 { 吸收量, 落到HP的量, 是否刚刚破碎 }
export function absorbDamage(s: ArmorState, dmg: number): { absorbed: number; hpDmg: number; broken: boolean } {
  const d = Math.max(0, dmg);
  const absorbed = Math.min(s.armor, d);
  const hpDmg = d - absorbed;
  s.armor = Math.max(0, s.armor - absorbed);
  return { absorbed, hpDmg, broken: absorbed > 0 && s.armor === 0 };
}

/** 破盾后恢复（清空护甲，表现层恢复原立绘） */
export function clearArmor(s: ArmorState): void {
  s.armor = 0;
}
