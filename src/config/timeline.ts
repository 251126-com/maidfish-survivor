// 刷怪时间轴：按时间段决定刷什么、刷多快
// intervalMs 越小刷得越快；maxAlive 是该时间段的同屏上限（全局还受 POOL_LIMIT 限制）
//
// v0.10.0 开局节奏重做：
//  - 0s 立刻来一小群（WAVE_EVENTS），前 10 秒就有可感知敌群；
//  - 前 60s 生成节奏 1.1s→0.6s，但 maxAlive 收紧（18→14/45→30/70→45/95→65/120→90）、
//    8~40s 间隔放缓（v0.10.1 finetune）：实测 30s 前后不再被 40+ 敌群淹没；
//  - dart(疾行鱼) 到 40s 才少量登场（公平：开局只面对慢速小蓝鱼），fat 到 60s 引入；
//  - v0.11.0: jelly(水母) 40s 起少量、lantern(灯笼鱼) 60s 起少量（慢速/冲刺有独立反制窗口）；
//  - 150s 进入 Boss 战节奏（小怪减速，聚焦 Boss），180s 后若 Boss 已破则恢复正常激增。
export interface SpawnPhase {
  fromSec: number;            // 起始时间（秒）
  intervalMs: number;         // 刷怪间隔
  batch: number;              // 每次刷几只
  maxAlive: number;           // 该阶段同屏上限
  weights: [string, number][];// [敌人id, 权重]
}

export const SPAWN_TIMELINE: SpawnPhase[] = [
  { fromSec: 0,   intervalMs: 1100, batch: 1, maxAlive: 14,
    weights: [['fish', 10]] },
  { fromSec: 8,   intervalMs: 1000, batch: 2, maxAlive: 30,
    weights: [['fish', 10]] },
  { fromSec: 22,  intervalMs: 800,  batch: 2, maxAlive: 45,
    weights: [['fish', 10]] },
  // v0.11.0: 水母 40s 起少量登场（慢速+蓄圈，不冲击开局容错），灯笼鱼 60s 起登场
  { fromSec: 40,  intervalMs: 680,  batch: 3, maxAlive: 65,
    weights: [['fish', 7], ['dart', 2], ['jelly', 1]] },
  { fromSec: 60,  intervalMs: 600,  batch: 3, maxAlive: 90,
    weights: [['fish', 6], ['dart', 2], ['fat', 1], ['jelly', 1], ['lantern', 1]] },
  { fromSec: 120, intervalMs: 500,  batch: 3, maxAlive: 150,
    weights: [['fish', 5], ['dart', 3], ['fat', 2], ['jelly', 1], ['lantern', 1]] },
  // Boss(150s) 出场后小怪减速刷，聚焦 Boss 战
  { fromSec: 150, intervalMs: 2000, batch: 2, maxAlive: 100,
    weights: [['fish', 4], ['dart', 3], ['fat', 2], ['jelly', 1]] },
  // Boss 击破后（通常 180s 之后）恢复正常刷怪节奏
  { fromSec: 180, intervalMs: 460,  batch: 4, maxAlive: 200,
    weights: [['fish', 5], ['dart', 3], ['fat', 3], ['jelly', 2], ['lantern', 2]] },
  { fromSec: 300, intervalMs: 430,  batch: 4, maxAlive: 240,
    weights: [['fish', 5], ['dart', 3], ['fat', 3], ['jelly', 2], ['lantern', 2]] },
  { fromSec: 480, intervalMs: 400,  batch: 5, maxAlive: 280,
    weights: [['fish', 5], ['dart', 3], ['fat', 3], ['jelly', 2], ['lantern', 2]] }
];

// v0.10.0 开场"波次"事件：在时间轴上额外触发的小规模浪潮，
// 比常规刷怪更近（radius 更小，进屏快），配横幅/文字给玩家清晰的节奏反馈。
export interface WaveEvent {
  atSec: number;
  label: string;            // 横幅文案
  burst: [string, number][];// 一次刷出的敌人组合
  radius: number;           // 生成环半径（小于常规 760~980，确保 10s 内进屏）
}

export const WAVE_EVENTS: WaveEvent[] = [
  { atSec: 0,   label: '开局 · 鱼群来袭', burst: [['fish', 4]], radius: 560 },
  { atSec: 10,  label: '第 1 波',         burst: [['fish', 6]], radius: 540 },
  { atSec: 24,  label: '第 2 波',         burst: [['fish', 5], ['dart', 1]], radius: 540 },
  { atSec: 42,  label: '第 3 波',         burst: [['fish', 4], ['dart', 2], ['fat', 1]], radius: 560 }
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
