// Boss/敌人弹幕：池化圆形弹（v0.9.0 → v0.9.1 修复）
// 用于扇弹(red fan)技能；无对象泄漏：出界/超时/命中即回收，池复用。
//
// v0.9.1 根因修复（审查发现）：
//  - 缺 compact：release 只打标记，live 表被死弹占满后 acquire 永远返回 null，
//    120 发（POOL_LIMIT.enemyBullet）后永久停火。现在每帧 update 末尾 compact。
//  - update/collide 缺 active 守卫：已释放的死弹在 compact 前仍可能被遍历/命中，
//    造成「死弹伤害」。现在 update 与命中判定都先检查 active。
//  - 本文件改为 type-only 导入 Phaser（可单测）；sprite 用结构接口，运行时仍是真 Phaser 对象。
import type Phaser from 'phaser';
import { EntityPool, type Poolable } from '../core/pool.ts';
import { POOL_LIMIT, WORLD_W, WORLD_H } from '../config/balance.ts';

/** 弹体 sprite 的最小结构（运行时由 Phaser.Image 满足） */
export interface BulletSprite {
  setVisible(v: boolean): void;
  setPosition(x: number, y: number): void;
  setDepth(d: number): void;
}

export class EnemyBullet implements Poolable {
  active = false;
  x = 0; y = 0;
  vx = 0; vy = 0;
  radius = 7;
  damage = 12;
  life = 0;       // 剩余寿命（秒）
  sprite!: BulletSprite;

  spawn(): void { this.life = 0; }
  despawn(): void { this.sprite.setVisible(false); }
}

/** 命中判定（含 active 守卫）：已释放/已过期的弹不再造成伤害。 */
export function bulletHitsPlayer(
  b: EnemyBullet, px: number, py: number, pRadius: number
): boolean {
  if (!b.active) return false;
  const rr = b.radius + pRadius;
  const dx = b.x - px;
  const dy = b.y - py;
  return dx * dx + dy * dy <= rr * rr;
}

export class EnemyBulletSystem {
  readonly pool: EntityPool<EnemyBullet>;
  /** scene 只用于取 sprite 工厂；参数结构兼容 Phaser.Scene，单测可传假 scene */
  constructor(scene: { add: { image: (x: number, y: number, texture: string) => BulletSprite } }, limit = POOL_LIMIT.enemyBullet) {
    this.pool = new EntityPool<EnemyBullet>(() => {
      const b = new EnemyBullet();
      b.sprite = scene.add.image(0, 0, 'ebullet');
      b.sprite.setVisible(false);
      b.sprite.setDepth(12);
      return b;
    }, limit);
  }

  /** 扇形/任意角发射：angle=弧度，speed px/s。返回子弹（池满返回 null）。 */
  spawn(x: number, y: number, angle: number, speed: number, damage: number, radius = 7, life = 3.2): EnemyBullet | null {
    const b = this.pool.acquire();
    if (!b) return null;
    b.x = x; b.y = y;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.radius = radius;
    b.damage = damage;
    b.life = life;
    b.sprite.setPosition(x, y);
    b.sprite.setVisible(true);
    return b;
  }

  update(dt: number): void {
    const live = this.pool.live;
    for (let i = 0; i < live.length; i++) {
      const b = live[i];
      if (!b.active) continue;              // active 守卫：死弹不推进
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const off = b.x < -40 || b.x > WORLD_W + 40 || b.y < -40 || b.y > WORLD_H + 40 || b.life <= 0;
      if (off) {
        this.pool.release(b);
        continue;
      }
      b.sprite.setPosition(b.x, b.y);
    }
    // 关键：每帧 compact。否则 release 只打标记，live 表被死弹占满 → 到上限后永久停火。
    this.pool.compact();
  }

  get live(): EnemyBullet[] { return this.pool.live; }
  get count(): number { return this.pool.activeCount; }
}
