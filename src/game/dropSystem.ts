// 掉落系统：经验球/金币/大白饭/饭盆，池化 + 磁吸拾取
// v0.7.0 新增两种特殊掉落：大白饭（回血）、饭盆（护甲）。
// v0.10.0：击杀产生的掉落向玩家方向喷出（朝向分量 + 小扩散），
//         并带 120ms 弹跳放大进场（Back.easeOut），让"掉东西"有清晰爽感；
//         掉落仍全程池化，上限受 POOL_LIMIT.gem 约束，手机横屏稳定。
import Phaser from 'phaser';
import { EntityPool, type Poolable } from '../core/pool.ts';
import { POOL_LIMIT } from '../config/balance.ts';
import type { Player } from './player.ts';

export type LootKind = 'xp' | 'gold' | 'rice' | 'bowl';

const LOOT_TEXTURE: Record<LootKind, string> = {
  xp: 'gem_xp',
  gold: 'gem_gold',
  rice: 'loot_rice',
  bowl: 'loot_bowl'
};

// v0.11.0 素材接线：正式 PNG 为 64x64（原程序化占位仅 ~20px），
// 按掉落类型做等比缩小显示（64*0.42≈27px 大白饭、64*0.45≈29px 铁盆），
// 只缩放不平铺拉伸，保持图标比例。
const LOOT_SCALE: Record<LootKind, number> = { xp: 1, gold: 1, rice: 0.42, bowl: 0.45 };

export class Gem implements Poolable {
  active = false;
  x = 0; y = 0;
  vx = 0; vy = 0;
  kind: LootKind = 'xp';
  value = 0;
  sprite!: Phaser.GameObjects.Image;

  spawn(): void { this.vx = 0; this.vy = 0; }
  despawn(): void { this.sprite.setVisible(false); }
}

export class DropSystem {
  readonly pool: EntityPool<Gem>;
  // 拾取回调，由 GameScene 注入
  onPickup: ((kind: LootKind, value: number) => void) | null = null;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.pool = new EntityPool<Gem>(() => {
      const g = new Gem();
      g.sprite = scene.add.image(0, 0, 'gem_xp');
      g.sprite.setVisible(false);
      g.sprite.setDepth(5);
      return g;
    }, POOL_LIMIT.gem);
  }

  // towardX/towardY 可选：击杀时传入玩家位置，掉落会明显向玩家方向飞一段再磁吸
  spawn(x: number, y: number, kind: LootKind, value: number, toward?: { x: number; y: number }): void {
    const g = this.pool.acquire();
    if (!g) return;
    g.x = x;
    g.y = y;
    g.kind = kind;
    g.value = value;
    if (toward) {
      // 向玩家方向喷出：主方向 170~260 px/s + 垂直小扩散
      const dx = toward.x - x;
      const dy = toward.y - y;
      const l = Math.hypot(dx, dy) || 1;
      const sp = 170 + Math.random() * 90;
      const spread = (Math.random() - 0.5) * 60;
      g.vx = (dx / l) * sp + -dy / l * spread;
      g.vy = (dy / l) * sp + dx / l * spread;
    } else {
      // 掉落时给一点随机初速，视觉更活
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 40;
      g.vx = Math.cos(a) * sp;
      g.vy = Math.sin(a) * sp;
    }
    g.sprite.setTexture(LOOT_TEXTURE[kind] ?? 'gem_xp');
    g.sprite.setPosition(x, y);
    g.sprite.setVisible(true);
    // 出场弹跳放大（复用池对象也重新播放）；目标缩放按掉落类型（大白饭/铁盆 PNG 等比缩小）
    const target = LOOT_SCALE[kind] ?? 1;
    g.sprite.setScale(target * 0.4);
    this.scene.tweens.add({
      targets: g.sprite,
      scale: target,
      duration: 120,
      ease: 'Back.easeOut'
    });
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

      // 磁吸：进入拾取范围后加速飞向玩家（v0.10.0 加速度略增，配合喷出更跟手）
      if (d2 < pickupSq) {
        const d = Math.sqrt(d2) || 1;
        const pull = 1050;
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
