// 升级面板 + 悬浮菜单的纯布局计算（可单测，Phaser 层只负责应用坐标）
//
// 已知缺陷回归点（v0.4.0）：
//  1. 卡片 tween 把所有子对象 tween 到同一 y —— name/desc/kind 重叠。
//     修复：每个子对象有独立基准坐标，tween 只做轻微上浮动画。
//  2. 描述换行宽度固定，可能溢出卡片边界。修复：按可用高度动态缩字。
//  3. 横屏手机更窄时卡片总宽 > 屏幕宽。修复：卡片宽随 GAME_W 自适应收缩。

export interface CardBox {
  cx: number;
  cy: number;
  kindY: number;
  nameY: number;
  descY: number;
}

export interface PanelLayout {
  cardW: number;
  cardH: number;
  gap: number;
  titleY: number;
  cards: CardBox[];
}

const CARD_W_MAX = 320;
const CARD_H = 400;
const GAP = 40;
const TITLE_Y = 60;
const SIDE_PAD = 20;                    // 两侧留白，保证最边卡片也不贴屏边

// 三张卡片居中排布；屏宽不足时收缩卡片宽，保证卡片不越界
export function computeCardLayout(gw: number, gh: number, count = 3): PanelLayout {
  // 可用宽度 = 屏宽 - 两侧留白 - 卡片间距
  const usable = Math.max(200, gw - SIDE_PAD * 2 - GAP * (count - 1));
  const cardW = Math.max(140, Math.min(CARD_W_MAX, Math.floor(usable / count)));
  const totalW = cardW * count + GAP * (count - 1);
  const startX = (gw - totalW) / 2;
  const cy = gh / 2 + 30;
  const cards: CardBox[] = [];
  for (let i = 0; i < count; i++) {
    const cx = startX + cardW / 2 + i * (cardW + GAP);
    cards.push({
      cx,
      cy,
      kindY: cy - CARD_H / 2 + 30,    // 顶部 K 标签
      nameY: cy - CARD_H / 2 + 94,    // 标签下方：武器/道具名
      descY: cy + CARD_H / 2 - 44     // 靠近底部：描述（name/kind 到 desc 之间留足空间）
    });
  }
  return { cardW, cardH: CARD_H, gap: GAP, titleY: TITLE_Y, cards };
}

// 估算等宽字体行高与列数，用于决定描述是否溢出卡片
export function estimateTextSize(text: string, fontSize: number): { width: number; height: number } {
  const charW = fontSize * 0.6;      // 等宽字体近似每个字符宽
  const lineH = Math.ceil(fontSize * 1.4);
  return { width: Math.ceil(text.length * charW), height: lineH };
}

// 描述换行并自适应字号：在 maxW x maxH 内放得下就少减字，否则逐步缩小字号
export function fitDescStyle(
  text: string,
  maxW: number,
  maxH: number,
  startFont: number,
  minFont = 12
): { fontSize: number; lines: number; lineHeight: number } {
  let fontSize = startFont;
  let lines = 1;
  for (;;) {
    const { width } = estimateTextSize(text, fontSize);
    lines = Math.max(1, Math.ceil(width / Math.max(20, maxW)));
    const lineHeight = Math.ceil(fontSize * 1.4);
    if (lines * lineHeight <= maxH) break;
    if (fontSize <= minFont) break;
    fontSize -= 1;
  }
  return { fontSize, lines, lineHeight: Math.ceil(fontSize * 1.4) };
}

// 悬浮球位置钳制（留 margin，避免拖出屏外导致找不到）
export function clampBall(x: number, y: number, r: number, gw: number, gh: number): { x: number; y: number } {
  const m = r + 8;
  return {
    x: Math.max(m, Math.min(gw - m, x)),
    y: Math.max(m, Math.min(gh - m, y))
  };
}
