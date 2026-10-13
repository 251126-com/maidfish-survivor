// 游戏反馈策略：把离散事件映射到"多重要反馈"，强度分档
// 原则（game-feel）：抖动只作用于相机视觉，不碰模拟；短促、按重要性分级；
// 常规事件（普通击杀/拾取）不触发屏幕抖动，避免糊成一片
export type FeelEvent = 'hurt' | 'elite' | 'boss';

export interface ShakeSpec {
  duration: number;   // ms
  intensity: number;  // 相机抖动强度（Phaser shake 参数）
}

const SHAKES: Record<FeelEvent, ShakeSpec> = {
  hurt: { duration: 160, intensity: 0.006 },
  // v0.13.0: 精英击杀轻震屏（比普通受击稍强、远弱于 Boss）
  elite: { duration: 150, intensity: 0.009 },
  boss: { duration: 420, intensity: 0.02 }
};

export function shakeForEvent(ev: FeelEvent): ShakeSpec {
  const s = SHAKES[ev];
  if (!s) throw new Error(`未知反馈事件: ${String(ev)}`);
  return s;
}
