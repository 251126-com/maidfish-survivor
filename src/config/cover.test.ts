// cover 布局纯逻辑单测
// 契约：等比放大到"铺满目标框"（可裁边不拉伸），16:9 素材在 1280x720 下应精确铺满。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverFit } from './cover.ts';

test('16:9 素材对 1280x720 精确铺满、无缩放', () => {
  const r = coverFit(1920, 1080, 1280, 720);
  assert.equal(r.w, 1280);
  assert.equal(r.h, 720);
});

test('等比保留：宽高比不因 cover 改变', () => {
  for (const [sw, sh, bw, bh] of [[1920,1080,1280,720],[1920,1080,844,390],[1000,500,300,300],[640,480,1280,720]]) {
    const r = coverFit(sw, sh, bw, bh);
    const src = sw / sh;
    const out = r.w / r.h;
    assert.ok(Math.abs(src - out) < 1e-6, `宽高比被破坏 ${src} != ${out}`);
    // 必须覆盖整个目标框（至少一个维度等于目标，另一个大于等于）
    assert.ok(r.w >= bw - 1e-6 && r.h >= bh - 1e-6, `未覆盖目标框 ${r.w}x${r.h} vs ${bw}x${bh}`);
    assert.ok(Math.abs(r.w - bw) < 1e-6 || Math.abs(r.h - bh) < 1e-6, 'cover 应至少贴住一条边');
  }
});

test('竖图 cover 横框：以宽度为准，高度裁切（不拉伸）', () => {
  const r = coverFit(1080, 1920, 1280, 720);
  assert.ok(Math.abs(r.w - 1280) < 1e-6, '宽度应贴住目标');
  assert.ok(r.h > 720, '高度应超出目标以便上下裁切');
});

test('输入非法（0 尺寸）不崩溃', () => {
  const r = coverFit(0, 1080, 1280, 720);
  assert.ok(Number.isFinite(r.w) && Number.isFinite(r.h));
});
