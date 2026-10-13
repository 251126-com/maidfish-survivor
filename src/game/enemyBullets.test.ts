// enemyBullets 回归测试（v0.9.1 审查发现）
// 覆盖：30+ 轮齐射不停火（compact 缺失根因）、过期/释放弹不伤害、命中一次、active 守卫。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyBulletSystem, bulletHitsPlayer } from './enemyBullets.ts';

function fakeSprite() {
  return {
    visible: false, x: 0, y: 0,
    setVisible(v: boolean) { this.visible = v; },
    setPosition(x: number, y: number) { this.x = x; this.y = y; },
    setDepth() {}
  };
}

function makeSystem(limit = 120) {
  let created = 0;
  const sys = new EnemyBulletSystem({
    add: { image: () => { created++; return fakeSprite(); } }
  } as any, limit);
  return { sys, createdCount: () => created };
}

test('30+ 轮齐射不停火：release 后每帧 compact 保证永远有容量', () => {
  // 池上限 8：没有 compact 时第 9 发起 acquire 永远返回 null（120 弹停火的小型复现）
  const { sys, createdCount } = makeSystem(8);
  for (let round = 0; round < 30; round++) {
    // 一轮齐射 3 发，寿命极短 → 下一帧全部过期回收
    const a = sys.spawn(100, 100, 0, 0, 10, 7, 0.001);
    const b = sys.spawn(100, 100, 0, 0, 10, 7, 0.001);
    const c = sys.spawn(100, 100, 0, 0, 10, 7, 0.001);
    assert.ok(a && b && c, `第 ${round} 轮应仍有容量（不得停火）`);
    sys.update(0.02);   // 过期 → release + compact
  }
  assert.ok(createdCount() <= 8 && createdCount() > 0, '对象池复用且不超过上限，不无限增长');
  assert.ok(sys.count < 8, 'live 表应已回收死弹');
});

test('真实池上限 120：连续生成-回收 120 发以上仍可继续发射', () => {
  const { sys } = makeSystem(120);
  for (let i = 0; i < 150; i++) {
    const b = sys.spawn(100, 100, 0, 0, 10, 7, 0.001);
    assert.ok(b, `第 ${i} 发应成功（120 后不得停火）`);
    sys.update(0.02);
  }
});

test('过期弹不伤害：life 耗尽被回收后 bulletHitsPlayer=false', () => {
  const { sys } = makeSystem();
  const b = sys.spawn(0, 0, 0, 0, 10, 7, 0.001)!;
  assert.ok(b.active);
  assert.equal(bulletHitsPlayer(b, 0, 0, 15), true);
  sys.update(0.02);   // 过期
  assert.equal(b.active, false, '过期弹应被回收为非 active');
  assert.equal(bulletHitsPlayer(b, 0, 0, 15), false, '过期弹不得再造成伤害');
});

test('释放弹不伤害：命中后回收的死弹不再命中（命中一次契约）', () => {
  const { sys } = makeSystem();
  const b = sys.spawn(0, 0, 0, 0, 10, 7, 100)!;   // 长寿命，仅因命中被回收
  assert.equal(bulletHitsPlayer(b, 0, 0, 15), true);
  sys.pool.release(b);                            // 模拟 collide 命中后的回收
  assert.equal(b.active, false);
  assert.equal(bulletHitsPlayer(b, 0, 0, 15), false, '释放后不重复伤害');
});

test('update 跳过非 active：死弹不被推进（active 守卫）', () => {
  const { sys } = makeSystem();
  const b = sys.spawn(10, 10, 0, 500, 10, 7, 100)!;   // 向右高速飞行
  sys.pool.release(b);                                // 其他路径（如跨帧命中）已释放
  const x0 = b.x;
  sys.update(0.1);
  assert.equal(b.x, x0, '非 active 弹不得被 update 继续推进');
  assert.equal(sys.count, 0, 'update 末尾 compact 应移除死弹');
});

test('击中一次后立即回收：不造成第二次伤害', () => {
  const { sys } = makeSystem();
  const b = sys.spawn(0, 0, 0, 0, 10, 7, 100)!;
  // 模拟 GameScene.collideEnemyBullets：命中 → 扣血 → 释放
  let hits = 0;
  if (bulletHitsPlayer(b, 0, 0, 15)) { hits++; sys.pool.release(b); }
  if (bulletHitsPlayer(b, 0, 0, 15)) { hits++; sys.pool.release(b); }
  assert.equal(hits, 1, '同一发弹只能命中一次');
});
