// Boss/敌人弹幕：池化圆形弹（v0.9.0）
// 用于扇弹(red fan)技能；无对象泄漏：出界/超时/命中即回收，池复用。
import Phaser from 'phaser';
import { EntityPool, type Poolable } from '../core/pool.ts';
import { POOL_LIMIT, WORLD_W, WORLD_H } from '../config/balance.ts';

export class EnemyBullet implements Poolable {
  active = false;
  x = 0; y = 0;
  vx = 0; vy = 0;
  radius = 7;
  damage = 12;
  life = 0;       // 剩余寿命（秒）
  sprite!: Phaser.GameObjects.Image;

  spawn(): void { this.life = 0; }
  despawn(): void { this.sprite.setVisible(false); }
}

export class EnemyBulletSystem {
  readonly pool: EntityPool<EnemyBullet>;

  constructor(scene: Phaser.Scene) {
    this.pool = new EntityPool<EnemyBullet>(() => {
      const b = new EnemyBullet();
      b.sprite = scene.add.image(0, 0, 'ebullet');
      b.sprite.setVisible(false);
      b.sprite.setDepth(12);
      return b;
    }, POOL_LIMIT.enemyBullet);
  }

  /** 扇形/任意角发射：angle=弧度，speed px/s */
  spawn(x: number, y: number, angle: number, speed: number, damage: number, radius = 7, life = 3.2): void {
    const b = this.pool.acquire();
    if (!b) return;
    b.x = x; b.y = y;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.radius = radius;
    b.damage = damage;
    b.life = life;
    b.sprite.setPosition(x, y);
    b.sprite.setVisible(true);
  }

  update(dt: number): void {
    const live = this.pool.live;
    for (let i = 0; i < live.length; i++) {
      const b = live[i];
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
  }

  get live(): EnemyBullet[] { return this.pool.live; }
  get count(): number { return this.pool.activeCount; }
}
