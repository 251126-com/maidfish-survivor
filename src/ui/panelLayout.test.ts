// 升级面板/悬浮球布局纯逻辑单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCardLayout, fitDescStyle, clampBall } from './panelLayout.ts';

test('三卡片在 GAME_W=1280 下保持标准尺寸且全部在屏内', () => {
  const L = computeCardLayout(1280, 720, 3);
  assert.equal(L.cardW, 320);
  const leftMost = L.cards[0].cx - L.cardW / 2;
  const rightMost = L.cards[2].cx + L.cardW / 2;
  assert.ok(leftMost >= 0, `最左卡片越界: ${leftMost}`);
  assert.ok(rightMost <= 1280, `最右卡片越界: ${rightMost}`);
  assert.equal(L.cards[0].cy, L.cards[1].cy);
});

test('窄屏（横屏手机 844x390）下卡片自动收缩仍不越界', () => {
  // 移动端逻辑分辨率固定 1280x720，但做窄屏防御：如将来改变量仍安全
  const L = computeCardLayout(700, 720, 3);
  const rightMost = L.cards[2].cx + L.cardW / 2;
  const leftMost = L.cards[0].cx - L.cardW / 2;
  assert.ok(rightMost <= 700, `窄屏最右越界: ${rightMost}`);
  assert.ok(leftMost >= 0, `窄屏最左越界: ${leftMost}`);
  assert.ok(L.cardW < 320, '窄屏应收缩卡片宽');
});

test('name/kind/desc 三者垂直排布不重叠', () => {
  const L = computeCardLayout(1280, 720, 3);
  for (const c of L.cards) {
    // kind 顶部、name 中部、desc 底部，各自间隔充足
    assert.ok(c.nameY > c.kindY + 24, 'name 应低于 kind');
    assert.ok(c.descY - c.nameY > 160, 'desc 与 name 之间留足空间');
  }
});

test('长描述自动缩小字号以放入卡片可用高度', () => {
  const longText = '进化：穿透一切，射速拉满，并且获得额外的暴击率加成与更远的射程';
  const maxW = 320 - 50;
  const maxH = 150;   // desc 区域近似高度
  const r = fitDescStyle(longText, maxW, maxH, 15, 12);
  assert.ok(r.fontSize >= 12 && r.fontSize <= 15);
  assert.ok(r.lines >= 2, '长文本应换行');
});

test('短描述保持原字号、单行', () => {
  const r = fitDescStyle('移速 +8%', 270, 150, 15, 12);
  assert.equal(r.fontSize, 15);
  assert.equal(r.lines, 1);
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
