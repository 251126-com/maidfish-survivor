// 升级系统：经验/等级状态机 + 三选一选项生成（纯逻辑，可单测）
import { OBTAINABLE_WEAPONS, WEAPONS } from '../config/weapons.ts';
import { BUFF_POOL, PASSIVES } from '../config/upgrades.ts';
import { xpNeed } from '../config/balance.ts';

export const MAX_WEAPON_SLOTS = 6;

export type OptionKind = 'new_weapon' | 'weapon_level' | 'buff' | 'passive' | 'evolution';

export interface UpgradeOption {
  kind: OptionKind;
  id: string;
  name: string;
  desc: string;
}

export interface OwnedInfo { id: string; level: number; maxed: boolean }

// 生成三选一。
// rng 可注入便于确定性测试；passives 为当前持有的被动道具等级表。
// 关键规则：进化选项一旦成立就必定出现在结果里（不被洗牌挤掉）。
export function rollUpgradeOptions(
  owned: OwnedInfo[],
  passives: Record<string, number> = {},
  rng: () => number = Math.random,
  slots: number = MAX_WEAPON_SLOTS
): UpgradeOption[] {
  const result: UpgradeOption[] = [];

  // 1) 进化：优先级最高，先占位
  const evolutions = collectEvolutions(owned, passives);
  if (evolutions.length > 0) result.push(evolutions[0]);

  const cands: UpgradeOption[] = [];

  // 2) 新武器（槽位未满时，排除进化武器）
  if (owned.length < slots) {
    for (const w of OBTAINABLE_WEAPONS) {
      if (!owned.some(o => o.id === w.id)) {
        cands.push({ kind: 'new_weapon', id: w.id, name: `新武器 · ${w.name}`, desc: w.desc });
      }
    }
  }

  // 3) 已有武器升级（未满级）
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

  // 4) 被动道具（含进化钥匙）
  for (const p of Object.values(PASSIVES)) {
    const lv = passives[p.id] ?? 0;
    if (lv >= p.maxLevel) continue;
    cands.push({
      kind: 'passive',
      id: p.id,
      name: `${p.name} Lv.${lv + 1}`,
      desc: p.desc
    });
  }

  // 5) 属性 Buff
  for (const b of BUFF_POOL) {
    cands.push({ kind: 'buff', id: b.id, name: b.name, desc: b.desc });
  }

  // Fisher-Yates 洗牌
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = cands[i];
    cands[i] = cands[j];
    cands[j] = t;
  }

  // 补足到 3 个，且不与已选中的进化选项重复
  const used = new Set(result.map(o => `${o.kind}:${o.id}`));
  for (const c of cands) {
    if (result.length >= 3) break;
    const key = `${c.kind}:${c.id}`;
    if (used.has(key)) continue;
    // 同一武器不应同时出现"升级"和"进化"
    if (c.kind === 'weapon_level' && result.some(r => r.kind === 'evolution' && r.id === c.id)) continue;
    used.add(key);
    result.push(c);
  }

  return result.slice(0, 3);
}

// 找出所有可进化的武器：满级 + 持有钥匙被动 + 进化目标未拥有
function collectEvolutions(owned: OwnedInfo[], passives: Record<string, number>): UpgradeOption[] {
  const out: UpgradeOption[] = [];
  for (const o of owned) {
    const w = WEAPONS[o.id];
    if (!w || !w.evolution) continue;
    if (o.level < w.maxLevel) continue;
    const keyLv = passives[w.evolution.requiredPassive] ?? 0;
    if (keyLv <= 0) continue;
    const target = WEAPONS[w.evolution.evolvesTo];
    if (!target) continue;
    if (owned.some(x => x.id === target.id)) continue;   // 已经进化过
    out.push({
      kind: 'evolution',
      id: o.id,
      name: `进化 · ${target.name}`,
      desc: target.desc
    });
  }
  return out;
}

// 经验与等级
export class LevelSystem {
  level = 1;
  xp = 0;
  pending = 0;   // 待处理的升级次数（可能一次涨多级）

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