import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FACE, faceScreenOffset, eyeOffsets, mouthOffset,
  pickExpression, blinkState, gunPose, gunRecoilOffset
} from './playerFx.ts';

test('faceScreenOffset 按素材尺寸等比换算', () => {
  // displayH=112 → 缩放 s=112/320=0.35；脸中心偏移 = (166-154)*0.35=4.2, (40-160)*0.35=-42
  const o = faceScreenOffset(112);
  assert.ok(Math.abs(o.cx - 4.2) < 1e-6);
  assert.ok(Math.abs(o.cy - (-42)) < 1e-6);
});

test('eyeOffsets 两眼间距随显示高度等比', () => {
  const e = eyeOffsets(112);
  // 间距 = (182-150)*0.35 = 11.2
  assert.ok(Math.abs(e.eyeGap - 11.2) < 1e-6);
  // 左右眼平均 x 相对脸中心偏移为 0（双眼对称）
  assert.ok(Math.abs(e.ex) < 1e-9);
});

test('mouthOffset 在人脸下部', () => {
  const m = mouthOffset(112);
  assert.ok(m.my > 0, '嘴在脸中心下方');
  assert.ok(Math.abs(m.mx - (176 - 166) * 0.35) < 1e-6);
});

test('pickExpression 优先级与兜底', () => {
  assert.equal(pickExpression({ moving: false, firing: false, hurt: false, alert: false, win: false, lose: false }), 'idle');
  assert.equal(pickExpression({ moving: true, firing: false, hurt: false, alert: false, win: false, lose: false }), 'move');
  assert.equal(pickExpression({ moving: true, firing: true, hurt: false, alert: false, win: false, lose: false }), 'fire');
  assert.equal(pickExpression({ moving: true, firing: true, hurt: true, alert: false, win: false, lose: false }), 'hurt');
  assert.equal(pickExpression({ moving: true, firing: true, hurt: false, alert: true, win: false, lose: false }), 'alert');
  assert.equal(pickExpression({ moving: false, firing: false, hurt: true, alert: true, win: false, lose: false }), 'hurt');
  assert.equal(pickExpression({ moving: false, firing: false, hurt: false, alert: false, win: true, lose: false }), 'win');
  assert.equal(pickExpression({ moving: false, firing: false, hurt: false, alert: false, win: true, lose: true }), 'lose');
});

test('blinkState 帧率无关：周期 3.6s，每周期仅短暂闭眼', () => {
  const closedWithin = [0, 0.05, 0.1];
  const openAfter = [0.9, 1.8, 3.4]; // 相移 1.2 秒后按周期算
  // 用 10000 步统计闭眼比例 ≈ 0.11
  let closed = 0;
  for (let i = 0; i < 10000; i++) {
    if (blinkState((i / 10000) * 3.6)) closed++;
  }
  const ratio = closed / 10000;
  assert.ok(ratio > 0.09 && ratio < 0.14, `闭眼比例应≈0.11, got ${ratio}`);
  // 首次眨眼窗口 t ∈ [2.4, 2.796]（相移1.2s，周期3.6s）
  assert.equal(blinkState(2.5), true);
  assert.equal(blinkState(1.8), false);
  assert.equal(blinkState(0.05), false);
});

test('gunPose：朝右不翻转、角度直传；朝左翻转并 +PI', () => {
  const r = gunPose(1, 1.0);
  assert.equal(r.flipX, false);
  assert.ok(Math.abs(r.rotation - 1.0) < 1e-6);
  const l = gunPose(-1, 1.0);
  assert.equal(l.flipX, true);
  assert.ok(Math.abs(l.rotation - (1.0 + Math.PI)) < 1e-6);
});

test('gunRecoilOffset 沿瞄准反向', () => {
  const o = gunRecoilOffset(0, 6, 1); // 朝右瞄准 → 后坐朝左
  assert.ok(Math.abs(o.rx - (-6)) < 1e-6);
  assert.ok(Math.abs(o.ry) < 1e-6);
  const up = gunRecoilOffset(Math.PI / 2, 5, 1);
  assert.ok(Math.abs(up.ry - (-5)) < 1e-6);
});
