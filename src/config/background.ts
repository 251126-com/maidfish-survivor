// 背景系统：四张授权背景（月宫遗迹/荧光海沟/沉船书库/深海旋涡）
// 纯逻辑模块，方便单元测试与 E2E 断言。
//
// v0.8.0 设计演进（用户反馈：旧 0/180/300/480 秒太晚，开局长期看不到四张背景）：
//  - 开局随机轮换起始背景（randomStartIndex），每局第一眼就不一样；
//  - 每 BG_SWITCH_SEC 秒自动轮换到下一张（循环），一局完整循环 = 4*60s，
//    开局 3 分钟内就能实际触达全部四张，Boss(600s) 前自然多次循环；
//  - 主菜单提供四张缩略卡可选起始背景（选关，首屏即见四张）；
//  - 局内 HUD「场景」按钮可手动切下一张（关卡切换明确）。
export interface BgPhase {
  /** Phaser 纹理 key（BootScene.preload 已加载） */
  key: string;
  /** 中文名：用于 HUD/菜单/切景提示/e2e 断言 */
  name: string;
}

// 四张授权背景的展示顺序（顺时针循环）
export const BG_ORDER: BgPhase[] = [
  { key: 'bg_moon',   name: '月宫遗迹' },
  { key: 'bg_trench', name: '荧光海沟' },
  { key: 'bg_ship',   name: '沉船书库' },
  { key: 'bg_vortex', name: '深海旋涡' }
];

/** 每张背景的停留时长（秒）：4 张 = 240 秒一轮，开局快节奏见到全部 */
export const BG_SWITCH_SEC = 60;

/** 一轮完整循环的时长（秒） */
export const BG_CYCLE_SEC = BG_SWITCH_SEC * BG_ORDER.length;

/** 交叉淡入淡出参数：淡出快、淡入慢，避免切换瞬间露底 */
export const BG_FADE = { outMs: 600, inMs: 900 };

/** 统一暗色遮罩透明度：压低背景亮度，保证角色/弹幕/敌人/HUD 可读 */
export const BG_MASK_ALPHA = 0.28;

/** 开局随机起始背景下标（0..n-1），每局开头轮换 */
export function randomStartIndex(rng: () => number = Math.random): number {
  return Math.floor(rng() * BG_ORDER.length);
}

/**
 * 局内第 elapsed 秒应显示哪张背景。
 * startIndex 为开局起始下标（0..n-1）；按 60s 一格向前循环。
 * (startIndex + floor(elapsed / BG_SWITCH_SEC)) % n，负值归一。
 */
export function activeBgIndex(elapsedSec: number, startIndex = 0): number {
  const n = BG_ORDER.length;
  const step = Math.floor(elapsedSec / BG_SWITCH_SEC);
  return ((startIndex % n) + (step % n) + n) % n;
}

export function activeBgAt(elapsedSec: number, startIndex = 0): BgPhase {
  return BG_ORDER[activeBgIndex(elapsedSec, startIndex)];
}

/** 从当前下标推下一张（循环），供 HUD「场景」按钮手动切换 */
export function nextBgIndex(idx: number): number {
  const n = BG_ORDER.length;
  return ((idx % n) + 1 + n) % n;
}

/**
 * 手动切换后的保持窗口截止秒数：elapsed 小于该值时手动选择不被时间轴拉回。
 * 手动 next 语义等价于时间轴前进一格，故保持一个 BG_SWITCH_SEC 后自然接回时间轴。
 */
export function manualHoldUntil(elapsedSec: number): number {
  return elapsedSec + BG_SWITCH_SEC;
}
