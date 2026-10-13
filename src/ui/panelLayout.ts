// 升级面板 + 悬浮菜单的纯布局计算（可单测，Phaser 层只负责应用坐标）
//
// 历史根因（务必不要回归）：
//  v0.4.0：卡片淡入 tween 把所有子对象 tween 到同一 y —— name/desc/kind 重叠。
//  v0.5.0：试图用 `y: [eachOwnY]` 的数组写法让每个对象各归其位 —— 这在 Phaser 里
//          是"单目标关键帧路径"（getStart=value[0]，getEnd=value[last]），
//          5 个目标全部被 tween 到数组最后一项 descY=546，且卡片背景也一起下移，
//          文字在卡片中心叠成一团 —— 用户截图 bug 的根因。
//  本版本：每个对象用独立 tween 归位；布局按纵向分区（kind/name/desc）计算，
//          保证分区互不重叠、不溢出卡片；窄竖屏自动转单列。

export interface CardZone {
  // 纵向分区中心与边界（画布逻辑坐标）
  kindY: number; kindTop: number; kindBottom: number;
  nameY: number; nameTop: number; nameBottom: number;
  descY: number; descTop: number; descBottom: number;
  // 文本可用宽/高（用于自适应换行/缩字）
  nameMaxW: number; nameMaxH: number;
  descMaxW: number; descMaxH: number;
}

export interface CardBox {
  cx: number;
  cy: number;
  zone: CardZone;
}

export interface PanelLayout {
  cardW: number;
  cardH: number;
  gap: number;
  titleY: number;
  cards: CardBox[];
  columns: number;     // 3 = 横向三列；1 = 窄竖屏单列堆叠
  scrollable: boolean; // 逻辑分辨率恒定 1280x720 时为 false；保留给未来响应式
}

const CARD_W_MAX = 320;
const MIN_CARD_W = 150;
const CARD_H_DEFAULT = 400;   // 先按默认 400，短屏自动收缩
const GAP_X = 40;
const GAP_Y = 26;
const SIDE_PAD = 20;
const TITLE_Y = 60;
const TITLE_SPAN = 36;        // 标题字体 30px 的近似占用高度
const PAD_X = 20;             // 卡片内文本左右留白
const BOTTOM_PAD = 22;        // 卡片底部到画布底的安全留白

// 卡片内纵向分区（相对卡高的比例）：
//  kind 顶部标签 → name 名称区 → desc 描述区（贴底部）
const KIND_Y_F = 0.09;   // kind 中心距卡顶
const KIND_H_F = 0.08;   // kind 区高
const NAME_Y_F = 0.25;   // name 中心距卡顶
const NAME_H_F = 0.18;   // name 区高（name 文字整体投影在此区内）
const DESC_Y_F = 0.17;   // desc 中心距卡底
const DESC_H_F = 0.26;   // desc 区高

function makeCard(cx: number, cy: number, cardW: number, cardH: number): CardBox {
  const top = cy - cardH / 2;
  const bottom = cy + cardH / 2;
  const kindY = top + cardH * KIND_Y_F;
  const kindHalf = (cardH * KIND_H_F) / 2;
  const nameY = top + cardH * NAME_Y_F;
  const nameHalf = (cardH * NAME_H_F) / 2;
  const descY = bottom - cardH * DESC_Y_F;
  const descHalf = (cardH * DESC_H_F) / 2;
  const padX = Math.min(PAD_X, Math.max(8, cardW * 0.12));
  const zone: CardZone = {
    kindY, kindTop: kindY - kindHalf, kindBottom: kindY + kindHalf,
    nameY, nameTop: nameY - nameHalf, nameBottom: nameY + nameHalf,
    descY, descTop: descY - descHalf, descBottom: descY + descHalf,
    nameMaxW: cardW - padX * 2, nameMaxH: nameHalf * 2,
    descMaxW: cardW - padX * 2, descMaxH: descHalf * 2
  };
  return { cx, cy, zone };
}

// 三张卡片居中排布；屏宽不足时收缩卡片宽，竖屏极窄时转单列纵向堆叠
export function computeCardLayout(gw: number, gh: number, count = 3): PanelLayout {
  if (count <= 0) count = 3;

  const minNeededW = MIN_CARD_W * count + GAP_X * (count - 1) + SIDE_PAD * 2;

  if (gw < minNeededW) {
    // ---------- 窄竖屏：垂直单列（每行一卡，点击区域不变小） ----------
    const cardW = Math.max(110, Math.min(CARD_W_MAX, gw - SIDE_PAD * 2));
    const topPad = TITLE_Y + TITLE_SPAN + 18;
    const bottomPad = BOTTOM_PAD;
    const usableH = Math.max(1, gh - topPad - bottomPad);
    const cardH = Math.max(150, Math.floor((usableH - GAP_Y * (count - 1)) / count));
    const totalH = cardH * count + GAP_Y * (count - 1);
    const startY = topPad + Math.max(0, (usableH - totalH) / 2);
    const cards: CardBox[] = [];
    for (let i = 0; i < count; i++) {
      const cy = startY + cardH / 2 + i * (cardH + GAP_Y);
      cards.push(makeCard(gw / 2, cy, cardW, cardH));
    }
    return { cardW, cardH, gap: GAP_Y, titleY: TITLE_Y, cards, columns: 1, scrollable: startY + totalH > gh };
  }

  // ---------- 横屏：水平三列 ----------
  const usable = Math.max(MIN_CARD_W * count, gw - SIDE_PAD * 2 - GAP_X * (count - 1));
  const cardW = Math.max(MIN_CARD_W, Math.min(CARD_W_MAX, Math.floor(usable / count)));
  // 防御：极端宽度下若仍越界，整体再收缩一档
  const totalW0 = cardW * count + GAP_X * (count - 1);
  const cardWFinal = (totalW0 > gw) ? Math.max(100, Math.floor((gw - GAP_X * (count - 1)) / count)) : cardW;
  const totalW = cardW * count + GAP_X * (count - 1);
  // 卡片高：默认 400，短屏自动收缩并保证不贴标题、不越下边界
  const cardH = Math.min(CARD_H_DEFAULT, Math.max(150, gh - (TITLE_Y + TITLE_SPAN + 16) - BOTTOM_PAD));
  const idealTop = (gh - cardH) / 2;
  const minTop = TITLE_Y + TITLE_SPAN + 16;
  const top = Math.max(minTop, idealTop);
  const cy = top + cardH / 2;
  const startX = (gw - totalW) / 2;
  const cards: CardBox[] = [];
  for (let i = 0; i < count; i++) {
    const cx = startX + cardW / 2 + i * (cardW + GAP_X);
    cards.push(makeCard(cx, cy, cardW, cardH));
  }
  return { cardW, cardH, gap: GAP_X, titleY: TITLE_Y, cards, columns: 3, scrollable: false };
}

// CJK 全角字符（等宽字体下约 1.0 倍字号），其余按 0.6 倍近似
function isCJK(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x2e80 && c <= 0x9fff) ||    // CJK 统一表意/部首
    (c >= 0xf900 && c <= 0xfaff) ||         // 兼容表意
    (c >= 0x3000 && c <= 0x30ff) ||         // 标点/假名
    (c >= 0xff00 && c <= 0xffef) ||         // 全角形式
    (c >= 0xac00 && c <= 0xd7af);           // 谚文
}

// 预估文本换行行数与行高，用于纯逻辑层挑选字号（Phaser 运行时还会用真实 canvas 度量复核）
// v0.7.1 硬保证：优先保证 name/desc 文字带硬不重叠 —— 估算层永不返回"已放不下却仍按最小字号溢出"的尺寸；
//   放不下时跌破首选最小字号继续缩（直到 absFloor）；absFloor 仍放不下则返回 truncated=true，
//   运行时据此截断为可用行数 + "…"。返回的 fontSize 恒为正整数。
export interface FittedText {
  fontSize: number;
  lines: number;
  lineHeight: number;
  truncated: boolean;
}

// 在 [hardFloor..start] 中选择"最大的能放下文本的字号"（依赖注入度量器，供运行时用真实 canvas 度量）
export interface FontFit { fontSize: number; truncated: boolean; }

export function pickLargestFit(
  text: string,
  maxW: number,
  maxH: number,
  start: number,
  hardFloor: number,
  measure: (fs: number) => number
): FontFit {
  for (let fs = start; fs >= hardFloor; fs--) {
    if (measure(fs) <= maxH + 0.01) return { fontSize: fs, truncated: false };
  }
  return { fontSize: Math.max(1, hardFloor), truncated: true };
}

export function fitTextStyle(
  text: string,
  maxW: number,
  maxH: number,
  startFont: number,
  minFont = 10,
  absFloor = 6
): FittedText {
  const floor = Math.min(absFloor, startFont);
  const lineHeightAt = (fs: number) => Math.max(1, Math.ceil(fs * 1.4));
  for (let fontSize = startFont; fontSize >= floor; fontSize--) {
    let width = 0;
    for (const ch of text) width += isCJK(ch) ? fontSize * 1.02 : fontSize * 0.6;
    width = Math.ceil(width);
    const lines = Math.max(1, Math.ceil(width / Math.max(20, maxW)));
    const lineHeight = lineHeightAt(fontSize);
    if (lines * lineHeight <= maxH) return { fontSize, lines, lineHeight, truncated: false };
  }
  // 跌破硬底仍放不下：返回硬底字号 + 截断标记，行数=可用行数（运行时据此截断文本）
  const fontSize = floor;
  const lineHeight = lineHeightAt(fontSize);
  const lines = Math.max(1, Math.floor(maxH / lineHeight));
  return { fontSize, lines, lineHeight, truncated: true };
}

// 兼容旧调用名：描述自适应缩字
// 兼容旧调用名：描述自适应缩字
export function fitDescStyle(
  text: string,
  maxW: number,
  maxH: number,
  startFont: number,
  minFont = 10
): { fontSize: number; lines: number; lineHeight: number } {
  return fitTextStyle(text, maxW, maxH, startFont, minFont);
}

// 悬浮球位置钳制（留 margin，避免拖出屏外导致找不到）
export function clampBall(x: number, y: number, r: number, gw: number, gh: number): { x: number; y: number } {
  const m = r + 8;
  return {
    x: Math.max(m, Math.min(gw - m, x)),
    y: Math.max(m, Math.min(gh - m, y))
  };
}

// ===== v0.7.0 逐字符折行（根治 Phaser wordWrap 对无空格纯中文不折行） =====
// 实测根因：Phaser Text 默认 wordWrap 按空格切词，纯中文无空格时整段不换行，
//    desc.width=675 远超内容区 280（probe-width 实证）。此处改为逐字符累计折行：
//    任何字符（含 CJK）在达到 maxW 处折行；单字符本身超宽仍单独成行（不丢字）。
// 度量器注入（measure(fs, str) 返回该字号下字符串宽度），纯逻辑可单测，
// 运行时由 Phaser canvas 提供真实度量。

export interface FitLines {
  fontSize: number;
  lines: string[];
  lineHeight: number;
  truncated: boolean;
}

export function wrapByChar(
  text: string,
  maxW: number,
  measure: (s: string) => number
): string[] {
  if (text === '') return [''];
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    const test = cur + ch;
    if (cur === '' || measure(test) <= maxW) {
      cur = test;
    } else {
      lines.push(cur);
      cur = ch;
    }
  }
  if (cur !== '' || lines.length === 0) lines.push(cur);
  return lines;
}

// 折行 + 缩字 + 截断一体化：在 [floor..start] 选最大可放下字号；
// 硬底仍放不下 → 截断为可用行数，末行尾追加 "…" 且保证不越宽。
export function fitTextLines(
  text: string,
  maxW: number,
  maxH: number,
  startFont: number,
  minFont = 11,
  absFloor = 6,
  measure: (fs: number, s: string) => number
): FitLines {
  const floor = Math.max(1, Math.min(absFloor, startFont));
  const lineHeightAt = (fs: number) => Math.max(1, Math.ceil(fs * 1.4));
  for (let fs = startFont; fs >= floor; fs--) {
    const lineHeight = lineHeightAt(fs);
    const lines = wrapByChar(text, maxW, (s) => measure(fs, s));
    if (lines.length * lineHeight <= maxH) {
      return { fontSize: fs, lines, lineHeight, truncated: false };
    }
  }
  // 硬底仍放不下：截断为可用行数，末行尾追加省略号（保证不越宽）
  const fontSize = floor;
  const lineHeight = lineHeightAt(fontSize);
  const allLines = wrapByChar(text, maxW, (s) => measure(fontSize, s));
  const avail = Math.max(1, Math.floor(maxH / lineHeight));
  const lines = allLines.slice(0, avail);
  if (allLines.length > avail && lines.length > 0) {
    const ell = '…';
    let last = lines[lines.length - 1] ?? '';
    while (last.length > 0 && measure(fontSize, last + ell) > maxW) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = last + ell;
  }
  return { fontSize, lines, lineHeight, truncated: true };
}
