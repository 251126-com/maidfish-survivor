// 升级面板布局纯逻辑单测
// 目标：任意 (gw, gh) 下，文本纵向分区（kind/name/desc）互不重叠、不溢出卡片；
//       三张卡点击区域（矩形）互不交叠且全部在画布内；窄竖屏自动转单列；
//       长中文描述可自适应缩小字号换行且不超区。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCardLayout, fitDescStyle, clampBall } from './panelLayout.ts';
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

test('超长描述即使缩到最小字号也只允许放不下才断，且永不返回非正字号', () => {
  const r = fitDescStyle('A'.repeat(200), 120, 60, 15, 10);
  assert.ok(r.fontSize >= 10, '不应低于最小字号');
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
