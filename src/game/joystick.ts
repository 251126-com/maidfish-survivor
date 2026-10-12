// 虚拟摇杆纯逻辑：把"按下点 + 当前点"换算成方向/幅度/摇杆头位置
// 与输入系统解耦，便于单测；输入系统只负责收集坐标与绘制
export interface JoystickResult {
  dirX: number;      // 方向向量（含幅度缩放，长度 0..1）
  dirY: number;
  magnitude: number; // 满速系数 0..1
  knobX: number;     // 摇杆头屏幕坐标（与 down/cur 同坐标系）
  knobY: number;
}

export function computeJoystick(
  downX: number, downY: number,
  curX: number, curY: number,
  maxRadius: number,
  deadZone: number
): JoystickResult {
  const dx = curX - downX;
  const dy = curY - downY;
  const len = Math.hypot(dx, dy);

  if (len < deadZone) {
    return { dirX: 0, dirY: 0, magnitude: 0, knobX: downX, knobY: downY };
  }

  const magnitude = Math.min(1, len / maxRadius);
  const ux = dx / len;
  const uy = dy / len;
  const clamped = Math.min(len, maxRadius);
  return {
    dirX: ux * magnitude,
    dirY: uy * magnitude,
    magnitude,
    knobX: downX + ux * clamped,
    knobY: downY + uy * clamped
  };
}
