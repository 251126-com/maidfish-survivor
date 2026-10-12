// 掉落系统：经验球与金币，池化 + 磁吸拾取
import Phaser from 'phaser';
import { EntityPool, type Poolable } from '../core/pool.ts';
import { POOL_LIMIT } from '../config/balance.ts';
import type { Player } from './player.ts';

export class Gem implements Poolable {
  active = false;
  x = 0; y = 0;
  vx = 0; vy = 0;
  kind: 'xp' | 'gold' = 'xp';
  value = 0;
  sprite!: Phaser.GameObjects.Image;

  spawn(): void { this.vx = 0; this.vy = 0; }
  despawn(): void { this.sprite.setVisible(false); }
}

export class DropSystem {
  readonly pool: EntityPool<Gem>;
  // 拾取回调，由 GameScene 注入
  onPickup: ((kind: 'xp' | 'gold', value: number) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.pool = new EntityPool<Gem>(() => {
      const g = new Gem();
      g.sprite = scene.add.image(0, 0, 'gem_xp');
      g.sprite.setVisible(false);
      g.sprite.setDepth(5);
      return g;
    }, POOL_LIMIT.gem);
  }

  spawn(x: number, y: number, kind: 'xp' | 'gold', value: number): void {
    const g = this.pool.acquire();
    if (!g) return;
    g.x = x;
    g.y = y;
    g.kind = kind;
    g.value = value;
    // 掉落时给一点随机初速，视觉更活
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 40;
    g.vx = Math.cos(a) * sp;
    g.vy = Math.sin(a) * sp;
    g.sprite.setTexture(kind === 'xp' ? 'gem_xp' : 'gem_gold');
    g.sprite.setPosition(x, y);
    g.sprite.setVisible(true);
  }

  update(dt: number, player: Player): void {
    const live = this.pool.live;
    const pickup = player.stats.pickup;
    const pickupSq = pickup * pickup;

    for (let i = 0; i < live.length; i++) {
      const g = live[i];
      const dx = player.x - g.x;
      const dy = player.y - g.y;
      const d2 = dx * dx + dy * dy;

      // 磁吸：进入拾取范围后加速飞向玩家
      if (d2 < pickupSq) {
        const d = Math.sqrt(d2) || 1;
        const pull = 900;   // 磁吸加速度
        g.vx += (dx / d) * pull * dt;
        g.vy += (dy / d) * pull * dt;
      } else {
        // 未吸附时阻尼减速
        g.vx *= 0.92;
        g.vy *= 0.92;
      }

      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.sprite.setPosition(g.x, g.y);

      // 拾取判定
      const pr = player.radius + 10;
      if (d2 < pr * pr) {
        if (this.onPickup) this.onPickup(g.kind, g.value);
        this.pool.release(g);
      }
    }
  }

  get count(): number { return this.pool.activeCount; }
}