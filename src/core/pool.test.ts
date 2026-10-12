// 对象池单元测试：重点覆盖复用、上限、compact 的 swap-remove 正确性
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EntityPool, type Poolable } from './pool.ts';

interface Item extends Poolable {
  id: number;
  x: number;
}

function makePool(limit = 3) {
  let created = 0;
  const pool = new EntityPool<Item>(() => {
    const it: Item = {
      id: ++created, active: false, x: 0,
      spawn() { this.x = 0; },
      despawn() { this.x = -1; }
    };
    return it;
  }, limit);
  return { pool, createdCount: () => created };
}

test('acquire 返回活跃对象，despawn 被调用', () => {
  const { pool } = makePool();
  const a = pool.acquire();
  assert.ok(a);
  assert.equal(a.active, true);
  assert.equal(pool.activeCount, 1);
});

test('release + compact 后对象被复用，不新建', () => {
  const { pool, createdCount } = makePool();
  const a = pool.acquire();
  assert.ok(a);
  pool.release(a);
  pool.compact();
  const b = pool.acquire();
  assert.equal(b, a, '应该复用同一个对象');
  assert.equal(createdCount(), 1, '只创建过一次');
  assert.equal(b.active, true);
});

test('达到上限后 acquire 返回 null', () => {
  const { pool } = makePool(2);
  assert.ok(pool.acquire());
  assert.ok(pool.acquire());
  assert.equal(pool.acquire(), null);
});

test('compact 的 swap-remove 不丢对象、不重复', () => {
  const { pool } = makePool(10);
  const items = [pool.acquire(), pool.acquire(), pool.acquire(), pool.acquire()].filter(Boolean) as Item[];
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
  pool.acquire(); pool.acquire();
  pool.releaseAll();
  assert.equal(pool.activeCount, 0);
});

test('重复 release 同一对象只回收一次', () => {
  const { pool } = makePool(10);
  const a = pool.acquire();
  assert.ok(a);
  pool.release(a);
  pool.release(a);
  pool.compact();
  assert.equal(pool.activeCount, 0);
  const b = pool.acquire();
  const c = pool.acquire();
  assert.notEqual(b, c, '不应拿到同一个对象两次');
});