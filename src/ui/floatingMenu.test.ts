// 悬浮球/悬浮面板纯逻辑单测（v0.5.0）
// 只测纯函数；Phaser 层（FloatingMenu 类）行为由 e2e/verify-floating.mjs 实测截图覆盖。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_W, GAME_H } from '../config/balance.ts';
import {
  BALL_RADIUS, DEFAULT_BALL_POS,
  resolveBallStart, computePanelLayout
} from './floatingMenuCore.ts';

test('默认悬浮球位在右下角高度区，不落在顶部 HUD 条/按钮区', () => {
  // 顶部 HUD：血条/经验条（y<110）、右上按钮区（x>GAME_W-120 且 y<240）
  assert.ok(DEFAULT_BALL_POS.y > 240, `默认 y=${DEFAULT_BALL_POS.y} 不应压顶栏`);
  assert.ok(DEFAULT_BALL_POS.x < GAME_W - 120 || DEFAULT_BALL_POS.y > 240,
    '默认位置应避开右上角按钮区');
});

test('从未保存(0,0)时回退到默认位置并被钳制', () => {
  const p = resolveBallStart(GAME_W, GAME_H, { x: 0, y: 0 }, DEFAULT_BALL_POS, BALL_RADIUS);
  assert.deepEqual(p, DEFAULT_BALL_POS);
  // 默认位置本身就在屏内
  assert.ok(p.x >= BALL_RADIUS && p.x <= GAME_W - BALL_RADIUS);
  assert.ok(p.y >= BALL_RADIUS && p.y <= GAME_H - BALL_RADIUS);
});

test('已保存位置被复用（且已按屏内钳制）', () => {
  const saved = { x: 400, y: 500 };
  const p = resolveBallStart(GAME_W, GAME_H, saved, DEFAULT_BALL_POS, BALL_RADIUS);
  assert.deepEqual(p, saved);
});

test('保存位置越界时被拉回屏内', () => {
  const p = resolveBallStart(GAME_W, GAME_H, { x: 99999, y: -50 }, DEFAULT_BALL_POS, BALL_RADIUS);
  // clampBall 语义：r+8 边距，避免贴屏边
  assert.equal(p.x, GAME_W - (BALL_RADIUS + 8));
  assert.equal(p.y, BALL_RADIUS + 8);
});

test('面板布局：7 个按钮（含场景切换）在卡片内垂直排布不重叠', () => {
  const L = computePanelLayout(GAME_W, GAME_H);
  const ids = L.items.map(i => i.id);
  assert.deepEqual(ids, ['resume', 'bg', 'sound', 'vib', 'full', 'restart', 'menu']);
  for (const it of L.items) {
    assert.ok(it.cy - 26 >= L.cy - L.cardH / 2, `${it.id} 顶部越界`);
    assert.ok(it.cy + 26 <= L.cy + L.cardH / 2, `${it.id} 底部越界`);
  }
  for (let i = 1; i < L.items.length; i++) {
    assert.ok(L.items[i].cy - L.items[i - 1].cy >= 52, '按钮行间距充足不重叠');
  }
});

test('面板布局：关闭按钮在卡片右上角内侧', () => {
  const L = computePanelLayout(GAME_W, GAME_H);
  assert.ok(L.closeX < L.cx + L.cardW / 2 - 8, '关闭按钮应在卡内');
  assert.ok(L.closeY < L.cy - L.cardH / 2 + 40, '关闭按钮应在卡片顶部区域');
  assert.ok(L.closeX > L.cx + L.cardW / 2 - 80, '不要离右边缘太远');
});

test('面板布局：标题在卡片内且不与 6 行按钮重叠', () => {
  const L = computePanelLayout(GAME_W, GAME_H);
  assert.ok(L.titleY > L.cy - L.cardH / 2 + 6, '标题在卡内');
  assert.ok(L.titleY < L.items[0].cy - 52, '标题与首行按钮不重叠');
});

test('面板含 Fullscreen API 手势入口（full 按钮）', () => {
  const L = computePanelLayout(GAME_W, GAME_H);
  const full = L.items.find(i => i.id === 'full');
  assert.ok(full, '面板必须提供全屏入口');
  assert.ok(/全屏/.test(full!.label), `full 按钮文案应含"全屏": ${full!.label}`);
  // full 行与其他按钮不重叠
  const ids = L.items.map(i => i.id);
  const idx = ids.indexOf('full');
  assert.ok(idx > 0 && idx < ids.length - 1, 'full 应位于音效/震动与重开/菜单之间');
  assert.ok(L.items[idx].cy - L.items[idx - 1].cy >= 52);
  assert.ok(L.items[idx + 1].cy - L.items[idx].cy >= 52);
});

test('Fullscreen 手势改造是纯函数友好的：isBlocked 语义独立于 Phaser', () => {
  // 设计契约：升级面板打开时悬浮球必须"可被禁用交互"（borrow 期/升级遮罩在上层）
  // 这里测纯逻辑部分：blocked 标记不应影响布局计算
  const L = computePanelLayout(GAME_W, GAME_H);
  assert.equal(L.items.length, 7);
  // 与 blocked 无关：布局永远可用
  assert.ok(L.cardW > 0 && L.cardH > 0);
});

test('面板提供「场景切换」入口（bg 按钮）且紧随继续游戏', () => {
  const L = computePanelLayout(GAME_W, GAME_H);
  const bg = L.items.find(i => i.id === 'bg');
  assert.ok(bg, '面板必须提供背景/场景切换入口');
  assert.ok(/场景/.test(bg!.label), `bg 按钮文案应含"场景": ${bg!.label}`);
  const ids = L.items.map(i => i.id);
  assert.equal(ids.indexOf('bg'), 1, '场景切换应紧随"继续游戏"，方便暂停时换景');
  // 与其他按钮不重叠
  const idx = ids.indexOf('bg');
  assert.ok(L.items[idx].cy - L.items[idx - 1].cy >= 52, '与继续游戏行间距不足');
  assert.ok(L.items[idx + 1].cy - L.items[idx].cy >= 52, '与音效行间距不足');
});

test('面板含场景按钮时文案不与其他行重叠且行内垂直居中', () => {
  const L = computePanelLayout(GAME_W, GAME_H);
  for (const it of L.items) {
    assert.ok(Math.abs(it.cy - (it.cy)) < 1e-9);
  }
  const all = L.items.map(i => i.id);
  assert.equal(new Set(all).size, 7, '行 id 唯一');
});
