// v0.10.0 顿帧（hit-stop）规格：短促时间缩放制造"打击定格"。
// 只用于大事件（连杀里程碑 / Boss 击破），普通击杀不顿帧，避免节奏糊掉。
// Phaser 侧实现用真实墙钟 setTimeout 恢复 timeScale（见 GameScene.hitStop）。
export type HitStopKind = 'milestone' | 'boss';

export interface HitStopSpec { ms: number; scale: number }

const SPECS: Record<HitStopKind, HitStopSpec> = {
  milestone: { ms: 55, scale: 0.2 },
  boss: { ms: 90, scale: 0.15 }
};

export function hitStopSpec(kind: HitStopKind): HitStopSpec {
  const s = SPECS[kind];
  if (!s) throw new Error(`未知顿帧事件: ${String(kind)}`);
  return s;
}
