// 对象池单元测试：重点覆盖复用、上限、compact 的 swap-remove 正确性
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EntityPool, type Poolable } from './pool.ts';

interface Item extends Poolable {
  id: number;
  x: number;
  spawns: number;
  despawns: number;
}

// 断言非空并返回强类型，避免后续出现 'possibly null' 报错
function must<T>(v: T | null | undefined): T {
  assert.ok(v !== null && v !== undefined, '期望取到非空对象');
  return v as T;
}

function makePool(limit = 3) {
  let created = 0;
  const pool = new EntityPool<Item>(() => {
    const it: Item = {
      id: ++created, active: false, x: 0, spawns: 0, despawns: 0,
      spawn() { this.x = 0; this.spawns++; },
      despawn() { this.x = -1; this.despawns++; }
    };
    return it;
  }, limit);
  return { pool, createdCount: () => created };
}

test('acquire 返回活跃对象，despawn 被调用', () => {
  const { pool } = makePool();
  const a = must(pool.acquire());
  assert.equal(a.active, true);
  assert.equal(pool.activeCount, 1);
});

test('release + compact 后对象被复用，不新建', () => {
  const { pool, createdCount } = makePool();
  const a = must(pool.acquire());
  pool.release(a);
  pool.compact();
  const b = must(pool.acquire());
  assert.equal(b, a, '应该复用同一个对象');
  assert.equal(createdCount(), 1, '只创建过一次');
  assert.equal(b.active, true);
});

test('达到上限后 acquire 返回 null', () => {
  const { pool } = makePool(2);
  must(pool.acquire());
  must(pool.acquire());
  assert.equal(pool.acquire(), null);
});

test('compact 的 swap-remove 不丢对象、不重复', () => {
  const { pool } = makePool(10);
  const items = [
    must(pool.acquire()), must(pool.acquire()),
    must(pool.acquire()), must(pool.acquire())
  ];
  // 释放中间两个
  pool.release(items[1]);
  pool.release(items[2]);
  pool.compact();
  assert.equal(pool.activeCount, 2);
  const alive = new Set(pool.live.map(i => i.id));
  assert.ok(alive.has(items[0].id), '第 0 个应存活');
  assert.ok(alive.has(items[3].id), '第 3 个应存活');
  assert.equal(alive.size, 2, '不应有重复或多余');
});

test('releaseAll 清空活跃列表', () => {
  const { pool } = makePool(10);
  must(pool.acquire());
  must(pool.acquire());
  pool.releaseAll();
  assert.equal(pool.activeCount, 0);
});

// 变异测试补强：破坏 release 的重复保护后，despawn 会被调用两次。
// 断言调用次数，才能真抓住这个变异（只断言 activeCount 抓不住）。
test('重复 release 同一对象时 despawn 只调用一次', () => {
  const { pool } = makePool(10);
  const a = must(pool.acquire());
  assert.equal(a.despawns, 0);
  pool.release(a);
  pool.release(a);        // 第二次应被守卫拦下
  assert.equal(a.despawns, 1, 'despawn 不应被重复调用');
  pool.compact();
  assert.equal(pool.activeCount, 0);
  const b = must(pool.acquire());
  const c = must(pool.acquire());
  assert.notEqual(b, c, '不应拿到同一个对象两次');
});

test('compact 后同一对象不会在 free 表里出现两次', () => {
  const { pool } = makePool(10);
  const a = must(pool.acquire());
  pool.release(a);
  pool.release(a);
  pool.compact();
  const b = must(pool.acquire());
  assert.equal(b, a);
  const c = must(pool.acquire());
  assert.notEqual(c, a, 'a 只能被取用一次');
});