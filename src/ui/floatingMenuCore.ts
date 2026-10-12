// 悬浮菜单（v0.5.0）：透明可拖拽悬浮球 + 全屏悬浮面板
//  - 悬浮球：半透明小圆球，可拖到屏幕任意位置（钳制在屏内），松手保存位置（localStorage）。
//  - 点按悬浮球 → 打开全屏面板：继续/暂停、音效、震动、重开本局、返回主菜单。
//  - 面板打开即暂停游戏（全屏遮罩，不遮"核心操作"——球体极小且可拖动避开）。
//  - 音效/震动开关走已有持久化模块（audio.ts / vibration.ts），悬浮球位置走 floatState.ts。
// 设计：纯布局/状态函数与 Phaser 类分离，纯函数可单测；行为由 e2e 截图验证。
import { GAME_W, GAME_H } from '../config/balance.ts';
import { sfx } from '../core/audio.ts';
import { vibrate, setVibrate, vibrateEnabled } from '../core/vibration.ts';
import { loadBallState, saveBallState } from './floatState.ts';
import { clampBall } from './panelLayout.ts';

// ---------- 纯逻辑（可单测） ----------

export const BALL_RADIUS = 26;
// 默认位置：右下角，避开顶部 HUD（血条/经验条/右上按钮区）与左上武器栏
export const DEFAULT_BALL_POS = { x: GAME_W - 78, y: GAME_H - 82 };

export interface BallPos { x: number; y: number; }

// 初始位置：从未保存(0,0) 用默认；已保存则复用；都按屏内钳制
export function resolveBallStart(
  gw: number, gh: number,
  saved: BallPos, fallback: BallPos, radius: number
): BallPos {
  const base = (saved.x === 0 && saved.y === 0) ? fallback : saved;
  return clampBall(base.x, base.y, radius, gw, gh);
}

export type PanelAction = 'resume' | 'sound' | 'vib' | 'full' | 'restart' | 'menu';

export interface PanelLayout {
  cardW: number;
  cardH: number;
  cx: number;
  cy: number;
  titleY: number;
  closeX: number;
  closeY: number;
  items: { id: PanelAction; cx: number; cy: number; label: string }[];
}

const ROWS: { id: PanelAction; label: string }[] = [
  { id: 'resume', label: '▶ 继续游戏' },
  { id: 'sound', label: '♪ 音效' },
  { id: 'vib', label: '📳 震动' },
  { id: 'full', label: '⛶ 全屏' },
  { id: 'restart', label: '↻ 重开本局' },
  { id: 'menu', label: '🏠 返回主菜单' }
];
const PANEL_W = 380;
const PANEL_H = 480;
export const ROW_H = 56;
const ROW_GAP = 8;

// 面板布局：居中卡片 + 5 行按钮 + 右上关闭钮（全屏遮罩由调用方铺）
export function computePanelLayout(gw: number, gh: number): PanelLayout {
  const cx = gw / 2;
  const cy = gh / 2;
  const rowsStart = cy - PANEL_H / 2 + 90;   // 避开标题(标题y=cy-H/2+32，底部约+48；首行按钮顶部=rowsStart-28)
  const items = ROWS.map((r, i) => ({
    id: r.id,
    cx,
    cy: rowsStart + i * (ROW_H + ROW_GAP),
    label: r.label
  }));
  return {
    cardW: PANEL_W,
    cardH: PANEL_H,
    cx, cy,
    titleY: cy - PANEL_H / 2 + 32,
    closeX: cx + PANEL_W / 2 - 28,
    closeY: cy - PANEL_H / 2 + 28,
    items
  };
}


// 本文件只含纯逻辑（可 node 单测），Phaser 类见 floatingMenu.ts。
