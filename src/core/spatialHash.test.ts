// 空间哈希单元测试：命中、漏判、清空、边界 clamp
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpatialHash } from './spatialHash.ts';

interface P { x: number; y: number; tag: string; }

test('查询命中同格与邻格对象', () => {
  const hash = new SpatialHash<P>(64, 1000, 1000);
  const a: P = { x: 100, y: 100, tag: 'a' };
  const b: P = { x: 120, y: 100, tag: 'b' };
  const far: P = { x: 800, y: 800, tag: 'far' };
  hash.insert(a.x, a.y, a);
  hash.insert(b.x, b.y, b);
  hash.insert(far.x, far.y, far);
  const out: P[] = [];
  hash.queryCircle(100, 100, 40, out);
  const tags = out.map(p => p.tag).sort();
  assert.deepEqual(tags, ['a', 'b']);
});

test('远处对象不被误判', () => {
  const hash = new SpatialHash<P>(64, 1000, 1000);
  hash.insert(900, 900, { x: 900, y: 900, tag: 'x' });
  const out: P[] = [];
  hash.queryCircle(50, 50, 30, out);
  assert.equal(out.length, 0);
});

test('clear 后查询为空', () => {
  const hash = new SpatialHash<P>(64, 1000, 1000);
  hash.insert(10, 10, { x: 10, y: 10, tag: 'a' });
  hash.clear();
  const out: P[] = [];
  hash.queryCircle(10, 10, 50, out);
  assert.equal(out.length, 0);
});

test('负坐标与超界坐标被 clamp，不崩溃', () => {
  const hash = new SpatialHash<P>(64, 1000, 1000);
  assert.doesNotThrow(() => hash.insert(-500, -500, { x: -500, y: -500, tag: 'neg' }));
  assert.doesNotThrow(() => hash.insert(99999, 99999, { x: 99999, y: 99999, tag: 'big' }));
  const out: P[] = [];
  assert.doesNotThrow(() => hash.queryCircle(-9999, -9999, 100, out));
});

test('queryCircle 复用 out 数组，不累积旧结果', () => {
  const hash = new SpatialHash<P>(64, 1000, 1000);
  hash.insert(100, 100, { x: 100, y: 100, tag: 'a' });
  const out: P[] = [];
  hash.queryCircle(100, 100, 40, out);
  assert.equal(out.length, 1);
  hash.clear();
  hash.insert(600, 600, { x: 600, y: 600, tag: 'b' });
  hash.queryCircle(100, 100, 40, out);   // 同一数组再查一次
  assert.equal(out.length, 0, '旧结果必须被清掉');
});