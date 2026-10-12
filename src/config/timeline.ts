// 刷怪时间轴：按时间段决定刷什么、刷多快
// intervalMs 越小刷得越快；maxAlive 是该时间段的同屏上限（全局还受 POOL_LIMIT 限制）
export interface SpawnPhase {
  fromSec: number;            // 起始时间（秒）
  intervalMs: number;         // 刷怪间隔
  batch: number;              // 每次刷几只
  maxAlive: number;           // 该阶段同屏上限
  weights: [string, number][];// [敌人id, 权重]
}

export const SPAWN_TIMELINE: SpawnPhase[] = [
  { fromSec: 0,   intervalMs: 1200, batch: 1, maxAlive: 40,
    weights: [['fish', 10]] },
  { fromSec: 60,  intervalMs: 900,  batch: 2, maxAlive: 80,
    weights: [['fish', 10]] },
  { fromSec: 180, intervalMs: 800,  batch: 2, maxAlive: 130,
    weights: [['fish', 8], ['fat', 2]] },
  { fromSec: 300, intervalMs: 650,  batch: 3, maxAlive: 200,
    weights: [['fish', 7], ['fat', 2], ['dart', 3]] },
  { fromSec: 480, intervalMs: 500,  batch: 3, maxAlive: 260,
    weights: [['fish', 6], ['fat', 3], ['dart', 4]] },
  // Boss 出场后小怪减速刷，聚焦 Boss 战
  { fromSec: 600, intervalMs: 2000, batch: 2, maxAlive: 120,
    weights: [['fish', 5], ['dart', 3], ['fat', 2]] }
];

export function currentPhase(elapsedSec: number): SpawnPhase {
  // 时间轴按 fromSec 升序，取最后一个满足条件的
  let phase = SPAWN_TIMELINE[0];
  for (const p of SPAWN_TIMELINE) {
    if (elapsedSec >= p.fromSec) phase = p;
    else break;
  }
  return phase;
}

export function pickEnemy(phase: SpawnPhase): string {
  let total = 0;
  for (const [, w] of phase.weights) total += w;
  let r = Math.random() * total;
  for (const [id, w] of phase.weights) {
    r -= w;
    if (r <= 0) return id;
  }
  return phase.weights[0][0];
}
