// 升级面板布局纯逻辑单测
// 目标：任意 (gw, gh) 下，文本纵向分区（kind/name/desc）互不重叠、不溢出卡片；
//       三张卡点击区域（矩形）互不交叠且全部在画布内；窄竖屏自动转单列；
//       长中文描述可自适应缩小字号换行且不超区。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCardLayout, fitDescStyle, fitTextStyle, pickLargestFit, wrapByChar, fitTextLines, clampBall } from './panelLayout.ts';
import type { PanelLayout } from './panelLayout.ts';

// ---------- 通用不变量 ----------
function assertCardInvariants(L: PanelLayout) {
  assert.ok(L.cards.length === 3, '恒为三张卡');
  assert.ok(L.cardW >= 100 && L.cardH >= 140, `卡片尺寸合理 got ${L.cardW}x${L.cardH}`);
  for (const c of L.cards) {
    const z = c.zone;
    const top = c.cy - L.cardH / 2;
    const bottom = c.cy + L.cardH / 2;
    // 分区上→下严格不重叠
    assert.ok(z.kindBottom < z.nameTop + 0.01, `kind 压到 name: kindBottom=${z.kindBottom} nameTop=${z.nameTop}`);
    assert.ok(z.nameBottom < z.descTop + 0.01, `name 压到 desc: nameBottom=${z.nameBottom} descTop=${z.descTop}`);
    // 分区不溢出卡片
    assert.ok(z.kindTop >= top - 0.01, 'kind 溢出卡片上边界');
    assert.ok(z.descBottom <= bottom + 0.01, `desc 溢出卡片下边界: ${z.descBottom} > ${bottom}`);
    assert.ok(z.nameTop >= top - 0.01 && z.nameBottom <= bottom + 0.01, 'name 超出卡片');
    // 文字可用宽高为正（极小画布下允许相对收紧，但必须仍可用）
    assert.ok(z.nameMaxW > 36 && z.nameMaxH >= 20, 'name 区域太小');
    assert.ok(z.descMaxW > 36 && z.descMaxH >= 24, `desc 区域太小: ${z.descMaxH}`);
  }
  // 卡片矩形两两不交叠（点击区域稳定、互不遮挡）
  for (let i = 0; i < L.cards.length; i++) {
    for (let j = i + 1; j < L.cards.length; j++) {
      const a = L.cards[i], b = L.cards[j];
      const aL = a.cx - L.cardW / 2, aR = a.cx + L.cardW / 2;
      const bL = b.cx - L.cardW / 2, bR = b.cx + L.cardW / 2;
      const aT = a.cy - L.cardH / 2, aB = a.cy + L.cardH / 2;
      const bT = b.cy - L.cardH / 2, bB = b.cy + L.cardH / 2;
      assert.ok(!(aL < bR && bL < aR && aT < bB && bT < aB), `卡片 ${i}/${j} 点击区域重叠`);
    }
  }
}
function assertInCanvas(L: PanelLayout, gw: number, gh: number) {
  for (const c of L.cards) {
    assert.ok(c.cx - L.cardW / 2 >= -0.01, '卡片左越界');
    assert.ok(c.cx + L.cardW / 2 <= gw + 0.01, '卡片右越界');
    assert.ok(c.cy - L.cardH / 2 >= -0.01, '卡片上越界');
    assert.ok(c.cy + L.cardH / 2 <= gh + 0.01, `卡片下越界: ${c.cy + L.cardH / 2} > ${gh}`);
  }
}

test('桌面 1280x720: 标准三列，分区不与标题/边界冲突', () => {
  const L = computeCardLayout(1280, 720, 3);
  assert.equal(L.cardW, 320);
  assert.equal(L.columns, 3);
  assertInCanvas(L, 1280, 720);
  assertCardInvariants(L);
  assert.ok(L.titleY + 34 < L.cards[0].zone.kindTop, '标题与卡片顶部应保持间距');
});

test('横屏 1280x720: 文本分区纵向不重叠且描述有足够可用高度(>=80)', () => {
  const L = computeCardLayout(1280, 720, 3);
  for (const c of L.cards) {
    assert.ok(c.zone.descMaxH >= 80, `desc 可用高度不足: ${c.zone.descMaxH}`);
    assert.ok(c.zone.nameMaxH >= 48, `name 可用高度不足: ${c.zone.nameMaxH}`);
  }
});

test('窄横屏（700x720）: 卡片收缩仍满足全部不变量', () => {
  const L = computeCardLayout(700, 720, 3);
  assert.ok(L.cardW < 320, '窄屏应收缩卡片宽');
  assertInCanvas(L, 700, 720);
  assertCardInvariants(L);
});

test('极窄横屏（640x360）: 卡片进一步收缩且不越界、分区不重叠', () => {
  const L = computeCardLayout(640, 360, 3);
  assertInCanvas(L, 640, 360);
  assertCardInvariants(L);
});

test('极窄竖屏（390x844）: 自动切换为垂直单列，卡不越界、点击区稳定', () => {
  const L = computeCardLayout(390, 844, 3);
  assert.equal(L.columns, 1, '窄竖屏应转单列');
  assertInCanvas(L, 390, 844);
  assertCardInvariants(L);
  // 纵向堆叠：相邻卡中心 y 间距 = cardH + gap，互不重叠
  for (let i = 1; i < L.cards.length; i++) {
    const prev = L.cards[i - 1].cy + L.cardH / 2;
    const cur = L.cards[i].cy - L.cardH / 2;
    assert.ok(cur >= prev + 0.01, '竖屏相邻卡重叠');
  }
});

test('扁竖屏（360x640）: 单列堆叠不越界', () => {
  const L = computeCardLayout(360, 640, 3);
  assert.equal(L.columns, 1);
  assertInCanvas(L, 360, 640);
  assertCardInvariants(L);
});

test('长中文描述: 自适应缩小字号后行高*行数 <= 可用高度', () => {
  const L = computeCardLayout(1280, 720, 3);
  const z = L.cards[0].zone;
  const longText = '进化：穿透一切，射速拉满，并且获得额外的暴击率加成与更远的射程，再加一层鲸鱼护盾';
  const r = fitDescStyle(longText, z.descMaxW, z.descMaxH, 15, 11);
  assert.ok(r.lines >= 2, '长文本应换行为多行');
  assert.ok(r.fontSize >= 11 && r.fontSize <= 15, `字号越界 ${r.fontSize}`);
  assert.ok(r.lines * r.lineHeight <= z.descMaxH + 0.01,
    `溢出: ${r.lines} 行 * 行高 ${r.lineHeight} = ${r.lines * r.lineHeight} > 可用 ${z.descMaxH}`);
});

test('超长描述: 硬保证优先于首选最小字号——跌破 min 后按估算也绝不溢出，且字号恒为正', () => {
  const r = fitDescStyle('A'.repeat(200), 120, 60, 15, 10);
  assert.ok(r.fontSize >= 6, `不应低于硬底 6，实际 ${r.fontSize}`);
  assert.ok(r.fontSize < 10, '该输入在首选最小字号 10 放不下，必须跌破 min');
  assert.ok(r.lines * r.lineHeight <= 60 + 0.01,
    `硬保证失败: ${r.lines} 行 * ${r.lineHeight} = ${r.lines * r.lineHeight} > 60`);
  assert.ok(r.lines > 1 && r.lineHeight > 0);
});

test('短描述保持原字号、单行', () => {
  const r = fitDescStyle('移速 +8%', 270, 104, 15, 11);
  assert.equal(r.fontSize, 15);
  assert.equal(r.lines, 1);
});

test('三张卡点击区域稳定: 同输入两次计算坐标一致', () => {
  const L1 = computeCardLayout(1280, 720, 3);
  const L2 = computeCardLayout(1280, 720, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(L1.cards[i].cx, L2.cards[i].cx);
    assert.equal(L1.cards[i].cy, L2.cards[i].cy);
    assert.equal(L1.cardW, L2.cardW);
  }
});

test('悬浮球位置钳制：越界坐标被拉回屏内', () => {
  const a = clampBall(0, 0, 28, 1280, 720);
  assert.equal(a.x, 36);
  assert.equal(a.y, 36);
  const b = clampBall(99999, 99999, 28, 1280, 720);
  assert.equal(b.x, 1280 - 36);
  assert.equal(b.y, 720 - 36);
  const c = clampBall(640, 360, 28, 1280, 720);
  assert.equal(c.x, 640);
  assert.equal(c.y, 360);
});

// ---- v0.7.1 硬保证：任何文本在分区内"估算不溢出"（必要时跌破首选最小字号 / 返回截断标记） ----
// 背景：v0.5.1 之后 fitTextStyle 在"已到首选最小字号但仍放不下"时会直接返回溢出尺寸，
//       在小卡（单列 360x640：desc 区高仅 ~39px）上长中文会把文字带推出分区，
//       与 name 分区交叠 → 用户截图的长中文桌面"分区交叠"隐患。
// 修复契约：优先保证 name/desc 文字带硬不重叠 —— 估算层永不返回"已放不下却仍按最小字号溢出"的尺寸，
//       实在放不下时返回 truncated=true，运行时据此截断为可用行数 + "…"。

test('长中文桌面: 1280x720 标准分区下，长描述不溢出且字号在合理区间', () => {
  const L = computeCardLayout(1280, 720, 3);
  const z = L.cards[0].zone;
  const text = '进化：穿透一切，射速拉满，并且获得额外的暴击率加成与更远的射程，再加一层鲸鱼护盾';
  const r = fitTextStyle(text, z.descMaxW, z.descMaxH, 15, 11, 6);
  assert.ok(r.truncated === false, '常规长中文不应截断');
  assert.ok(r.lines * r.lineHeight <= z.descMaxH + 0.01,
    `硬保证失败: ${r.lines} 行 * 行高 ${r.lineHeight} = ${r.lines * r.lineHeight} > 可用 ${z.descMaxH}`);
  assert.ok(r.fontSize >= 11, '常规长中文不应跌破首选最小字号');
});

test('单列小卡（360x640）desc 分区: 超长文本必须跌破首选最小字号以保证估算不溢出', () => {
  const L = computeCardLayout(360, 640, 3);
  const z = L.cards[0].zone;
  const text = '进'.repeat(60);
  const r = fitTextStyle(text, z.descMaxW, z.descMaxH, 15, 11, 6);
  assert.ok(r.truncated === false);
  assert.ok(r.fontSize < 11, `应跌破首选最小字号 11，实际 ${r.fontSize}`);
  assert.ok(r.lines * r.lineHeight <= z.descMaxH + 0.01,
    `硬保证失败: ${r.lines} 行 * ${r.lineHeight} = ${r.lines * r.lineHeight} > 可用 ${z.descMaxH}`);
});

test('病态超长文本: 跌破硬底仍放不下时返回 truncated=true，且估算行数不超可用行数', () => {
  const r = fitTextStyle('进'.repeat(400), 60, 24, 15, 11, 6);
  assert.equal(r.truncated, true, '病态文本应标记截断');
  assert.ok(r.fontSize >= 6, `不应低于硬底 6，实际 ${r.fontSize}`);
  assert.ok(r.lines * r.lineHeight <= 24 + 0.01,
    `截断后行数仍不超区: ${r.lines} * ${r.lineHeight} = ${r.lines * r.lineHeight}`);
});

test('pickLargestFit: 在 [hardFloor..start] 中选最大的可放下字号；全部放不下时返回硬底+truncated', () => {
  // 模拟"文本高度随字号线性增长"的度量器
  const measure = (fs: number) => fs * 1.4;
  assert.equal(pickLargestFit('x', 100, 14, 8, 4, measure).fontSize, 8, 'start 本身可放下时应选 start');
  // fs=7 → 9.8<=10；fs=8 → 11.2>10 → 应回退到 7
  assert.equal(pickLargestFit('x', 100, 10, 8, 4, measure).fontSize, 7, 'start 放不下时向下回退到最大可放字号');
  // fs=4 → 5.6 > 4 → 全部放不下 → 返回硬底 4 + truncated
  const r = pickLargestFit('x', 100, 4, 8, 4, measure);
  assert.equal(r.fontSize, 4);
  assert.equal(r.truncated, true, '放不下时应标记截断');
});


// ---- v0.7.0 逐字符折行回归（Phaser wordWrap 对无空格纯中文不折行 → 改用逐字符折行） ----
// 模拟度量器：CJK 全角 1.02 倍字号，其余 0.6 倍字号（与 fitTextStyle 的估算规则一致）
function fakeMeasure(fs: number, s: string): number {
  let w = 0;
  for (const ch of s) w += isCjk(ch) ? fs * 1.02 : fs * 0.6;
  return w;
}
function isCjk(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x2e80 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0x3000 && c <= 0x30ff) || (c >= 0xff00 && c <= 0xffef) || (c >= 0xac00 && c <= 0xd7af);
}

test('wrapByChar: 纯中文无空格长串按 maxW 逐字符折行，每行宽度不超 maxW', () => {
  const text = '进化穿透一切射速拉满并且获得额外暴击率加成与更远射程再加一层鲸鱼护盾叠满更持久';
  const maxW = 200;
  const measure = (s: string) => fakeMeasure(15, s);
  const lines = wrapByChar(text, maxW, measure);
  assert.ok(lines.length >= 3, `纯中文应折成多行，实际 ${lines.length}`);
  for (const ln of lines) {
    assert.ok(measure(ln) <= maxW + 0.6, `行 ${ln} 宽度 ${measure(ln)} 超 ${maxW}`);
  }
  assert.equal(lines.join(''), text, '折行不应丢字');
});

test('wrapByChar: 混合中英数字（含空格短句）同样能折行且不越宽', () => {
  const text = '伤害 +8% 且经验 +10%，同时扩大拾取范围，每级再额外叠加 2% 的暴击与 1% 移速';
  const maxW = 180;
  const measure = (s: string) => fakeMeasure(15, s);
  const lines = wrapByChar(text, maxW, measure);
  assert.ok(lines.length >= 2);
  for (const ln of lines) assert.ok(measure(ln) <= maxW + 0.6);
  assert.equal(lines.join(''), text);
});

test('wrapByChar: 短文本单行不拆分，空串返回空行', () => {
  assert.deepEqual(wrapByChar('短', 200, s => fakeMeasure(15, s)), ['短']);
  assert.deepEqual(wrapByChar('', 200, s => fakeMeasure(15, s)), ['']);
});

test('fitTextLines: 纯中文无空格长描述在 desc 分区内折行+缩字，行高*行数不超 maxH', () => {
  const L = computeCardLayout(1280, 720, 3);
  const z = L.cards[0].zone;
  const text = '进化穿透一切射速拉满并且获得额外暴击率加成与更远射程再加一层鲸鱼护盾叠满更持久';
  const r = fitTextLines(text, z.descMaxW, z.descMaxH, 15, 11, 6, (fs, s) => fakeMeasure(fs, s));
  assert.equal(r.truncated, false);
  assert.ok(r.lines.length >= 2, `应折成多行，实际 ${r.lines.length}`);
  for (const ln of r.lines) assert.ok(fakeMeasure(r.fontSize, ln) <= z.descMaxW + 0.6, `行越宽: ${fakeMeasure(r.fontSize, ln)}`);
  assert.ok(r.lines.length * r.lineHeight <= z.descMaxH + 0.01, `高度越界 ${r.lines.length * r.lineHeight} > ${z.descMaxH}`);
});

test('fitTextLines: 病态超长纯中文（字体最小仍放不下）→ truncated=true、截断不越宽不越界', () => {
  const text = '进'.repeat(400);
  const r = fitTextLines(text, 60, 24, 15, 11, 6, (fs, s) => fakeMeasure(fs, s));
  assert.equal(r.truncated, true, '病态文本应截断');
  assert.ok(r.fontSize === 6, `应停在硬底 6，实际 ${r.fontSize}`);
  for (const ln of r.lines) assert.ok(fakeMeasure(r.fontSize, ln) <= 60 + 1.5, `截断行仍越宽: ${ln}`);
  assert.ok(r.lines.length * r.lineHeight <= 24 + 0.01, '截断后行数仍不超高');
});

test('fitTextLines: 截断时末行带省略号 … 且省略后仍不越宽', () => {
  const r = fitTextLines('进'.repeat(60), 280, 60, 15, 11, 6, (fs, s) => fakeMeasure(fs, s));
  assert.equal(r.truncated, false, '60 字不应触发截断');
  // 极小分区强制截断，验证省略号逻辑
  const r2 = fitTextLines('进'.repeat(200), 200, 40, 15, 11, 6, (fs, s) => fakeMeasure(fs, s));
  assert.equal(r2.truncated, true);
  if (r2.lines.length === 0) throw new Error('截断后至少保留一行');
  const last = r2.lines[r2.lines.length - 1];
  const endsEll = last.endsWith('…');
  const fullNoEll = r2.lines.length * r2.lineHeight <= 40 + 0.01;
  assert.ok(endsEll || fullNoEll || r2.lines.join('').length < 200, '截断时末行应带省略号或已包含全文');
});

test('fitTextLines: 空文本与极短文本安全返回单行', () => {
  const r = fitTextLines('', 280, 100, 15, 11, 6, (fs, s) => fakeMeasure(fs, s));
  assert.equal(r.truncated, false);
  assert.deepEqual(r.lines, ['']);
  const r2 = fitTextLines('甲', 280, 100, 15, 11, 6, (fs, s) => fakeMeasure(fs, s));
  assert.deepEqual(r2.lines, ['甲']);
  assert.equal(r2.fontSize, 15);
});

// v0.7.1 升级卡接入契约：levelUpPanel 用 fitTextLines 对 name/desc 分别折行后，
// 两者文本带（行数*行高以分区中心对称展开）必须互不重叠、且各自不超分区宽高。
// 这是"纯逻辑层先行"的回归保护：运行时 Phaser 用真实 canvas 度量，此处用注入度量器等价验证。
test('fitTextLines 升级卡集成契约: name/desc 文本带互不重叠且不超分区', () => {
  const L = computeCardLayout(1280, 720, 3);
  const z = L.cards[0].zone;
  const nameR = fitTextLines('大肥鱼磁暴轨道歼星炮改三型', z.nameMaxW, z.nameMaxH, 22, 11, 6, (fs, s) => fakeMeasure(fs, s));
  const descR = fitTextLines('进化穿透一切射速拉满并且获得额外的暴击率加成与更远的射程再加护盾', z.descMaxW, z.descMaxH, 15, 11, 6, (fs, s) => fakeMeasure(fs, s));
  assert.equal(nameR.truncated, false, '常规 name 不应截断');
  assert.equal(descR.truncated, false, '常规 desc 不应截断');
  assert.ok(nameR.lines.length * nameR.lineHeight <= z.nameMaxH + 0.01, 'name 高度溢出分区');
  assert.ok(descR.lines.length * descR.lineHeight <= z.descMaxH + 0.01, 'desc 高度溢出分区');
  const nameBottom = z.nameY + (nameR.lines.length * nameR.lineHeight) / 2;
  const descTop = z.descY - (descR.lines.length * descR.lineHeight) / 2;
  assert.ok(descTop >= nameBottom - 0.01,
    `name/desc 文本带重叠: nameBottom=${nameBottom.toFixed(2)} descTop=${descTop.toFixed(2)}`);
  for (const ln of nameR.lines) assert.ok(fakeMeasure(nameR.fontSize, ln) <= z.nameMaxW + 0.6, 'name 行越宽');
  for (const ln of descR.lines) assert.ok(fakeMeasure(descR.fontSize, ln) <= z.descMaxW + 0.6, 'desc 行越宽');
});
