// v0.16.2 大厅新排版纯逻辑单测（TDD 先行）
// 目标：左侧纵向四入口(皮肤/永久强化/背景/设置) + 左下开始游戏 + 右上独立金币胶囊，
//       任意横屏视口（FIT 等比缩放）下各矩形不重叠、不溢出；人物区(构图中心)不被 UI 压盖。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLobbyLayout, scaledRects, type LobbyLayout, type Rect } from './lobbyLayout.ts';

type BoundsLike = Rect | { id: string; left: number; top: number; right: number; bottom: number; w: number; h: number };
function lr(r: BoundsLike) {
  if ('cx' in r) return { left: r.cx - r.w / 2, right: r.cx + r.w / 2, top: r.cy - r.h / 2, bottom: r.cy + r.h / 2 };
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
}
function overlap(a: BoundsLike, b: BoundsLike): boolean {
  const A = lr(a), B = lr(b);
  return A.left < B.right && B.left < A.right && A.top < B.bottom && B.top < A.bottom;
}

test('布局结构：左侧4入口 + 左下开始 + 右上金币 + 左上标题', () => {
  const L = buildLobbyLayout();
  assert.equal(L.nav.length, 4, '左侧四个入口');
  assert.deepEqual(L.nav.map(n => n.id), ['skin', 'upgrade', 'bg', 'settings'], '顺序：皮肤/强化/背景/设置');
  // 左侧纵向：全部 x 一致（cx 相等），纵向依次递增不重叠
  const cxSet = new Set(L.nav.map(n => n.cx));
  assert.equal(cxSet.size, 1, '四个入口同列');
  assert.ok(L.nav[0].cy < L.nav[1].cy && L.nav[1].cy < L.nav[2].cy && L.nav[2].cy < L.nav[3].cy, '纵向排列');
  for (let i = 0; i < L.nav.length; i++)
    for (let j = i + 1; j < L.nav.length; j++)
      assert.ok(!overlap(L.nav[i], L.nav[j]), `入口 ${i}/${j} 重叠`);
  // 开始游戏在左下：left 与入口列同侧，cy 靠底部
  const s = lr(L.start);
  assert.ok(s.left < 400, '开始按钮在左侧');
  assert.ok(s.bottom <= L.GAME_H - 20, '开始按钮不贴底溢出');
  // 金币胶囊在右上
  const g = lr(L.gold);
  assert.ok(g.right >= L.GAME_W - 60, '金币胶囊贴右上');
  assert.ok(g.top >= 8, '金币胶囊不超顶');
  // 标题在左上，不与导航重叠
  assert.ok(L.title.x < 400, '标题靠左');
  assert.ok(L.title.y + 30 < L.nav[0].cy - L.nav[0].h / 2, '标题不与首入口重叠');
});

test('任意横屏视口下：缩放矩形互不重叠且不溢出视口', () => {
  const viewports = [
    ['desktop-1280x720', 1280, 720],
    ['laptop-1366x768', 1366, 768],
    ['desktop-1024x768', 1024, 768],
    ['desktop-960x540', 960, 540],
    ['phone-landscape-844x390', 844, 390],
    ['phone-landscape-667x375', 667, 375],
    ['small-embed-480x320', 480, 320],
    ['small-square-500x420', 500, 420],
    ['tiny-360x300', 360, 300],
  ] as const;
  const L = buildLobbyLayout();
  for (const [name, vw, vh] of viewports) {
    const rects = scaledRects(L, vw, vh);
    const all = [...rects.nav, rects.start, rects.gold];
    for (const r of all) {
      assert.ok(r.right <= vw + 0.01 && r.bottom <= vh + 0.01 && r.left >= -0.01 && r.top >= -0.01,
        `${name}: ${r.id} 溢出视口 (${r.left},${r.top},${r.right},${r.bottom}) vs ${vw}x${vh}`);
    }
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        assert.ok(!overlap(all[i], all[j]), `${name}: ${all[i].id}/${all[j].id} 缩放后重叠`);
  }
});

test('人物构图区(画面中心偏左)不被左侧 UI 压盖：导航右缘与开始按钮左缘在人物安全区左侧', () => {
  const L = buildLobbyLayout();
  const navR = lr(L.nav[L.nav.length - 1]).right;
  assert.ok(navR <= 340, `导航右缘 ${navR} 超过人物安全区(<=340)`);
  const sL = lr(L.start).right;
  assert.ok(sL <= 340, `开始按钮右缘 ${sL} 超过人物安全区(<=340)`);
});

test('导航/开始/金币与背景环境层深度分层标记存在', () => {
  const L = buildLobbyLayout();
  assert.ok(L.depth.bg === 0 && L.depth.env > 0 && L.depth.bg < L.depth.env, '背景层在环境层之下');
  assert.ok(L.depth.ui > L.depth.env, 'UI 层在环境层之上');
});
