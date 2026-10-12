// 升级系统：经验/等级状态机 + 三选一选项生成（纯逻辑，可单测）
import { WEAPONS } from '../config/weapons.ts';
import { BUFF_POOL } from '../config/upgrades.ts';
import { xpNeed } from '../config/balance.ts';

export const MAX_WEAPON_SLOTS = 6;

export type OptionKind = 'new_weapon' | 'weapon_level' | 'buff';

export interface UpgradeOption {
  kind: OptionKind;
  id: string;
  name: string;
  desc: string;
}

export interface OwnedInfo { id: string; level: number; maxed: boolean }

// 生成三选一。rng 可注入，便于确定性测试
export function rollUpgradeOptions(
  owned: OwnedInfo[],
  rng: () => number = Math.random,
  slots: number = MAX_WEAPON_SLOTS
): UpgradeOption[] {
  const cands: UpgradeOption[] = [];

  // 1) 新武器（槽位未满时）
  if (owned.length < slots) {
    for (const w of Object.values(WEAPONS)) {
      if (!owned.some(o => o.id === w.id)) {
        cands.push({ kind: 'new_weapon', id: w.id, name: `新武器 · ${w.name}`, desc: w.desc });
      }
    }
  }

  // 2) 已有武器升级（未满级）
  for (const o of owned) {
    if (o.maxed) continue;
    const w = WEAPONS[o.id];
    if (!w) continue;
    cands.push({
      kind: 'weapon_level',
      id: o.id,
      name: `${w.name} Lv.${o.level + 1}`,
      desc: '提升该武器伤害与射速'
    });
  }

  // 3) 属性 Buff
  for (const b of BUFF_POOL) {
    cands.push({ kind: 'buff', id: b.id, name: b.name, desc: b.desc });
  }

  // Fisher-Yates 洗牌（用注入的 rng）
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = cands[i];
    cands[i] = cands[j];
    cands[j] = t;
  }

  return cands.slice(0, 3);
}

// 经验与等级
export class LevelSystem {
  level = 1;
  xp = 0;
  pending = 0;   // 待处理的升级次数（可能一次涨多级）

  // 返回当前累计待升级次数
  addXp(amount: number, xpMult = 1): number {
    this.xp += amount * xpMult;
    // while 而非 if：一次吃大量经验可以连升多级
    while (this.xp >= xpNeed(this.level)) {
      this.xp -= xpNeed(this.level);
      this.level++;
      this.pending++;
    }
    return this.pending;
  }

  get need(): number { return xpNeed(this.level); }
  get ratio(): number { return Math.min(1, this.xp / this.need); }

  consumeLevelUp(): boolean {
    if (this.pending <= 0) return false;
    this.pending--;
    return true;
  }
}