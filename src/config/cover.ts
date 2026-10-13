// cover 布局工具：等比缩放素材使其"铺满"目标框（可裁边、绝不拉伸/留黑边）。
// 用于固定屏幕背景在 1280x720 / 手机横屏（FIT 适配后的 16:9 画布）上的摆放。
export function coverFit(
  srcW: number, srcH: number, boxW: number, boxH: number
): { w: number; h: number } {
  if (srcW <= 0 || srcH <= 0 || boxW <= 0 || boxH <= 0) {
    // 非法输入按 1:1 兜底，避免渲染端崩溃
    return { w: boxW > 0 ? boxW : 1280, h: boxH > 0 ? boxH : 720 };
  }
  const scale = Math.max(boxW / srcW, boxH / srcH);
  return { w: srcW * scale, h: srcH * scale };
}
