// v0.16.2 大厅排版纯布局计算（可单测；Phaser 层只负责应用坐标与样式）
// 排版依据用户最终参考图：左侧纵向 皮肤/永久强化/背景/设置，左下「开始游戏」，
// 右上独立金币玻璃胶囊，左上标题；背景仅环境层（气泡/光斑光柱/折射/视差），
// 不在代码绘制额外人物/小鱼。逻辑画布恒定 1280x720（Phaser FIT 等比缩放），
// 故任意横屏视口不重叠 = 逻辑坐标不重叠。

export interface Rect {
  id: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface LobbyLayout {
  GAME_W: number;
  GAME_H: number;
  /** 左上标题（左对齐锚点） */
  title: { x: number; y: number; size: number };
  sub: { x: number; y: number; size: number };
  best: { x: number; y: number; size: number };
  /** 左侧纵向四入口，顺序固定：skin/upgrade/bg/settings */
  nav: Rect[];
  /** 左下「开始游戏」 */
  start: Rect;
  /** 右上独立金币胶囊 */
  gold: Rect;
  /** 版本角标（底部中央） */
  version: { x: number; y: number };
  /** 深度分层：背景 < 环境 < UI */
  depth: { bg: number; env: number; ui: number };
}

const GAME_W = 1280;
const GAME_H = 720;
const LEFT = 48;
const NAV_W = 250;
const NAV_H = 64;
const NAV_GAP = 16;
const NAV_TOP = 176;

const NAV_IDS = ['skin', 'upgrade', 'bg', 'settings'] as const;

export function buildLobbyLayout(): LobbyLayout {
  const nav: Rect[] = NAV_IDS.map((id, i) => ({
    id,
    cx: LEFT + NAV_W / 2,
    cy: NAV_TOP + NAV_H / 2 + i * (NAV_H + NAV_GAP),
    w: NAV_W,
    h: NAV_H,
  }));
  const start: Rect = { id: 'start', cx: LEFT + 260 / 2, cy: GAME_H - 92, w: 260, h: 82 };
  const gold: Rect = { id: 'gold', cx: GAME_W - 40 - 200 / 2, cy: 44, w: 200, h: 56 };
  return {
    GAME_W,
    GAME_H,
    title: { x: LEFT, y: 60, size: 34 },
    sub: { x: LEFT, y: 102, size: 14 },
    best: { x: LEFT, y: 126, size: 12 },
    nav,
    start,
    gold,
    version: { x: GAME_W / 2, y: GAME_H - 16 },
    depth: { bg: 0, env: 1, ui: 6 },
  };
}

export interface ScaledRect { id: string; left: number; top: number; right: number; bottom: number; w: number; h: number; }

/** 按 Phaser FIT 规则（scale = min(vw/GW, vh/GH)）把逻辑矩形映射到指定视口的 CSS 像素 */
export function scaledRects(
  L: LobbyLayout,
  vw: number,
  vh: number,
): { nav: ScaledRect[]; start: ScaledRect; gold: ScaledRect } {
  const scale = Math.min(vw / L.GAME_W, vh / L.GAME_H);
  const map = (r: Rect): ScaledRect => ({
    id: r.id,
    left: (r.cx - r.w / 2) * scale,
    top: (r.cy - r.h / 2) * scale,
    right: (r.cx + r.w / 2) * scale,
    bottom: (r.cy + r.h / 2) * scale,
    w: r.w * scale,
    h: r.h * scale,
  });
  return { nav: L.nav.map(map), start: map(L.start), gold: map(L.gold) };
}
