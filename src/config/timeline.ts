// 刷怪时间轴：按时间段决定刷什么、刷多快
// intervalMs 越小刷得越快；maxAlive 是该时间段的同屏上限（全局还受 POOL_LIMIT 限制）
//
// v0.13.0 节奏重做：约每 30s 一波怪潮（~20s 高刷）+ 10s 喘息期（刷速大降、场上清空可喘息）。
//  - 波次起始点：0 / 30 / 60 / 90 / 120 / 150 / 180 / 210 / 240（Boss 前增援）秒，配屏幕边缘预警横幅；
//  - 前 60s 温吞：0s 开局一小群、波次 1/2 间隔 950/800ms、同屏上限 12/22/32，不淹不空窗；
//  - dart(疾行鱼) 30s 波起少量登场（1只），fat(肥鱼) 90s 波起引入；
//  - 230~240s 短暂平静蓄势，240~270s 翻倍刷怪（Boss 前压迫期），270s Boss 登场后小怪减速聚焦 Boss；
//  - 300s 后若 Boss 已破则恢复正常激增。
export interface SpawnPhase {
  fromSec: number;            // 起始时间（秒）
  intervalMs: number;         // 刷怪间隔
  batch: number;              // 每次刷几只
  maxAlive: number;           // 该阶段同屏上限
  weights: [string, number][];// [敌人id, 权重]
}

export const SPAWN_TIMELINE: SpawnPhase[] = [
  // —— 波次 0（0~20s）开局暖场：少量可感知，不淹没 ——
  { fromSec: 0,   intervalMs: 1100, batch: 1, maxAlive: 12,
    weights: [['fish', 10]] },
  // —— 喘息 1（20~30s）——
  { fromSec: 20,  intervalMs: 1700, batch: 1, maxAlive: 8,
    weights: [['fish', 10]] },
  // —— 波次 1（30~50s）：疾行鱼首次少量登场 ——
  { fromSec: 30,  intervalMs: 950,  batch: 2, maxAlive: 22,
    weights: [['fish', 9], ['dart', 1]] },
  // —— 喘息 2（50~60s）——
  { fromSec: 50,  intervalMs: 1500, batch: 1, maxAlive: 12,
    weights: [['fish', 9], ['dart', 1]] },
  // —— 波次 2（60~80s）——
  { fromSec: 60,  intervalMs: 800,  batch: 2, maxAlive: 32,
    weights: [['fish', 8], ['dart', 2]] },
  // —— 喘息 3（80~90s）——
  { fromSec: 80,  intervalMs: 1400, batch: 1, maxAlive: 14,
    weights: [['fish', 8], ['dart', 1]] },
  // —— 波次 3（90~110s）：肥鱼首次登场 ——
  { fromSec: 90,  intervalMs: 720,  batch: 3, maxAlive: 42,
    weights: [['fish', 7], ['dart', 2], ['fat', 1]] },
  // —— 喘息 4（110~120s）——
  { fromSec: 110, intervalMs: 1300, batch: 1, maxAlive: 18,
    weights: [['fish', 7], ['dart', 1]] },
  // —— 波次 4（120~140s）——
  { fromSec: 120, intervalMs: 640,  batch: 3, maxAlive: 56,
    weights: [['fish', 6], ['dart', 3], ['fat', 1]] },
  // —— 喘息 5（140~150s）——
  { fromSec: 140, intervalMs: 1200, batch: 1, maxAlive: 20,
    weights: [['fish', 6], ['dart', 2]] },
  // —— 波次 5（150~170s）——
  { fromSec: 150, intervalMs: 580,  batch: 3, maxAlive: 64,
    weights: [['fish', 6], ['dart', 3], ['fat', 2]] },
  // —— 喘息 6（170~180s）——
  { fromSec: 170, intervalMs: 1200, batch: 1, maxAlive: 22,
    weights: [['fish', 6], ['dart', 2]] },
  // —— 波次 6（180~200s）——
  { fromSec: 180, intervalMs: 540,  batch: 4, maxAlive: 80,
    weights: [['fish', 5], ['dart', 3], ['fat', 2]] },
  // —— 喘息 7（200~210s）——
  { fromSec: 200, intervalMs: 1100, batch: 1, maxAlive: 24,
    weights: [['fish', 5], ['dart', 2]] },
  // —— 波次 7（210~230s）——
  { fromSec: 210, intervalMs: 500,  batch: 4, maxAlive: 96,
    weights: [['fish', 5], ['dart', 4], ['fat', 2]] },
  // —— 喘息 8（230~240s）：Boss 前短暂平静蓄势 ——
  { fromSec: 230, intervalMs: 1400, batch: 1, maxAlive: 20,
    weights: [['fish', 5], ['dart', 2]] },
  // —— Boss 逼近期（240~270s）：刷怪频率翻倍（相对 210s 波次），压迫感拉满 ——
  { fromSec: 240, intervalMs: 340,  batch: 5, maxAlive: 140,
    weights: [['fish', 5], ['dart', 4], ['fat', 2]] },
  // —— Boss(270s) 登场后小怪减速，聚焦 Boss 战 ——
  { fromSec: 270, intervalMs: 2000, batch: 2, maxAlive: 100,
    weights: [['fish', 4], ['dart', 3], ['fat', 2]] },
  // —— Boss 击破后（通常 300s 之后）恢复正常刷怪节奏 ——
  { fromSec: 300, intervalMs: 460,  batch: 4, maxAlive: 200,
    weights: [['fish', 5], ['dart', 3], ['fat', 3]] },
  { fromSec: 480, intervalMs: 430,  batch: 4, maxAlive: 240,
    weights: [['fish', 5], ['dart', 3], ['fat', 3]] },
  { fromSec: 600, intervalMs: 400,  batch: 5, maxAlive: 280,
    weights: [['fish', 5], ['dart', 3], ['fat', 3]] }
];

// v0.13.0 开场"波次"事件：每 ~30s 一波怪潮（配屏幕边缘预警横幅），
// 比常规刷怪更近（radius 更小，进屏快），给玩家清晰的节奏反馈。
// 前 60s 只 0/30 两波、每波少量疾行鱼，不淹不空窗；240s 是 Boss 前增援波。
export interface WaveEvent {
  atSec: number;
  label: string;            // 横幅文案
  burst: [string, number][];// 一次刷出的敌人组合
  radius: number;           // 生成环半径（小于常规 760~980，确保 10s 内进屏）
}

export const WAVE_EVENTS: WaveEvent[] = [
  { atSec: 0,   label: '开局 · 鱼群来袭', burst: [['fish', 4]], radius: 560 },
  { atSec: 30,  label: '第 1 波',         burst: [['fish', 6], ['dart', 1]], radius: 540 },
  { atSec: 60,  label: '第 2 波',         burst: [['fish', 6], ['dart', 2]], radius: 540 },
  { atSec: 90,  label: '第 3 波',         burst: [['fish', 5], ['dart', 2], ['fat', 1]], radius: 560 },
  { atSec: 120, label: '第 4 波',         burst: [['fish', 5], ['dart', 3], ['fat', 1]], radius: 560 },
  { atSec: 150, label: '第 5 波',         burst: [['fish', 5], ['dart', 3], ['fat', 2]], radius: 560 },
  { atSec: 180, label: '第 6 波',         burst: [['fish', 6], ['dart', 4], ['fat', 2]], radius: 570 },
  { atSec: 210, label: '第 7 波',         burst: [['fish', 6], ['dart', 4], ['fat', 3]], radius: 570 },
  { atSec: 240, label: 'Boss 将至 · 增援', burst: [['fish', 8], ['dart', 5], ['fat', 3]], radius: 580 }
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
