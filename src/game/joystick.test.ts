// 虚拟摇杆纯逻辑单测：方向/幅度/摇杆头位置
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeJoystick } from './joystick.ts';

const MAX = 72;
const DEAD = 5;

test('未超过死区时返回零方向与零幅度', () => {
  const r = computeJoystick(100, 100, 103, 101, MAX, DEAD);
  assert.equal(r.dirX, 0);
  assert.equal(r.dirY, 0);
  assert.equal(r.magnitude, 0);
});

test('拖动到满半径时方向为单位向量（长度 1）', () => {
  const r = computeJoystick(0, 0, MAX, 0, MAX, DEAD);
  assert.equal(r.dirX, 1);
  assert.equal(r.dirY, 0);
  assert.equal(r.magnitude, 1);
});

test('幅度按半径线性缩放，方向保持归一化', () => {
  const r = computeJoystick(0, 0, 36, 0, MAX, DEAD);
  assert.equal(r.magnitude, 0.5);
  assert.equal(r.dirX, 0.5);   // 半速时 dir 向量长度 0.5
});

test('对角线方向归一化后长度不超过 1', () => {
  const r = computeJoystick(0, 0, MAX, MAX, MAX, DEAD);
  const len = Math.hypot(r.dirX, r.dirY);
  assert.ok(len <= 1 + 1e-9, `dir 长度应 <=1，实际 ${len}`);
  assert.ok(len > 0.99, `满速对角线长度应≈1，实际 ${len}`);
});

test('超出半径后摇杆头被钳制在圆环上，方向不变', () => {
  const r = computeJoystick(0, 0, MAX * 3, 0, MAX, DEAD);
  assert.equal(r.magnitude, 1);
  assert.equal(r.knobX, MAX);
  assert.equal(r.knobY, 0);
});

test('摇杆头位置 = 起点 + 钳制后的拖动向量', () => {
  const r = computeJoystick(200, 150, 260, 190, MAX, DEAD);
  const dx = 60, dy = 40, len = Math.hypot(dx, dy);
  const nx = 200 + (dx / len) * Math.min(len, MAX);
  const ny = 150 + (dy / len) * Math.min(len, MAX);
  assert.ok(Math.abs(r.knobX - nx) < 1e-9);
  assert.ok(Math.abs(r.knobY - ny) < 1e-9);
});

test('反向拖动返回负方向', () => {
  const r = computeJoystick(0, 0, -MAX, 0, MAX, DEAD);
  assert.equal(r.dirX, -1);
  assert.equal(r.knobX, -MAX);
});
