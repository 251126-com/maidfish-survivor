// 敌人系统：池化敌人 + 追踪玩家 + 分离力（防止叠成一坨）+ 受击闪白 + 轻击退
// v0.10.0：命中后沿弹道方向给一段指数衰减的击退位移（Boss 免疫击退），
// 受击闪白从 0.08s 提到 0.11s，让"打中"更有存在感，但震屏仍只留给大事件。
import Phaser from 'phaser';
import { EntityPool, type Poolable } from '../core/pool.ts';
import { SpatialHash } from '../core/spatialHash.ts';
import { ENEMIES, type EnemyDef } from '../config/enemies.ts';
import { WORLD_W, WORLD_H, POOL_LIMIT, hpScale, speedScale } from '../config/balance.ts';

export class Enemy implements Poolable {
  // 唯一自增 id：子弹穿透时用它判重，避免重复扣血
  readonly uid: number = ++Enemy.uidSeq;
  private static uidSeq = 0;

  active = false;
  x = 0;
  y = 0;
  hp = 1;
  maxHp = 1;
  speed = 0;
  damage = 0;
  radius = 16;
  xp = 0;
  goldChance = 0;
  isBoss = false;
  orbitCd = 0;        // 环绕武器对该敌人的独立命中冷却
  // v0.10.0 击退位移（px/s 级初速，指数衰减到 0）
  knockX = 0;
  knockY = 0;
  def!: EnemyDef;
  sprite!: Phaser.GameObjects.Image;
  flash = 0;

  spawn(): void { this.flash = 0; this.orbitCd = 0; this.knockX = 0; this.knockY = 0; }
  despawn(): void { this.sprite.setVisible(false); }
}

export class EnemySystem {
  readonly pool: EntityPool<Enemy>;
  private hash: SpatialHash<Enemy>;
  private neighborBuf: Enemy[] = [];
  private readonly separationWeight = 0.7;   // 分离力权重，越大越不叠
  // 击杀回调：由 GameScene 注入，用于计分/掉落（在 release 之前调用，此时敌人数据仍有效）
  onKill: ((e: Enemy) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.hash = new SpatialHash<Enemy>(64, WORLD_W, WORLD_H);
    this.pool = new EntityPool<Enemy>(() => {
      const e = new Enemy();
      e.sprite = scene.add.image(0, 0, 'enemy_fish');
      e.sprite.setVisible(false);
      e.sprite.setDepth(10);
      return e;
    }, POOL_LIMIT.enemy);
  }

  // 生成敌人；到达池上限返回 null（保证帧率）
  spawn(defId: string, x: number, y: number, elapsed: number): Enemy | null {
    const def = ENEMIES[defId];
    if (!def) return null;
    const e = this.pool.acquire();
    if (!e) return null;

    e.def = def;
    e.x = x;
    e.y = y;
    // v0.10.0: Boss 血量固定不随 elapsed 膨胀（Boss 是节奏事件，普通敌人仍按时间成长）
    e.maxHp = e.isBoss ? def.hp : def.hp * hpScale(elapsed);
    e.hp = e.maxHp;
    e.speed = def.speed * speedScale(elapsed);
    e.damage = def.damage;
    e.radius = def.radius;
    e.xp = def.xp;
    e.goldChance = def.goldChance;
    e.isBoss = def.id === 'boss';

    e.sprite.setTexture(def.texture);
    e.sprite.setScale(def.scale);
    e.sprite.setPosition(x, y);
    e.sprite.setVisible(true);
    e.sprite.clearTint();
    return e;
  }

  // 每帧：重建空间哈希 → 追踪 + 分离 + 击退衰减
  update(dt: number, px: number, py: number): void {
    const live = this.pool.live;

    this.hash.clear();
    for (let i = 0; i < live.length; i++) {
      const e = live[i];
      this.hash.insert(e.x, e.y, e);
    }

    for (let i = 0; i < live.length; i++) {
      const e = live[i];

      // 朝玩家移动
      const dx = px - e.x;
      const dy = py - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let mx = dx / d;
      let my = dy / d;

      // 分离力：邻近敌人互相推开
      this.neighborBuf.length = 0;
      this.hash.queryCircle(e.x, e.y, e.radius * 2, this.neighborBuf);
      let sx = 0, sy = 0;
      for (let j = 0; j < this.neighborBuf.length; j++) {
        const o = this.neighborBuf[j];
        if (o === e) continue;
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const od = Math.hypot(ox, oy);
        const minD = e.radius + o.radius;
        if (od > 0.001 && od < minD) {
          const push = (minD - od) / minD;
          sx += (ox / od) * push;
          sy += (oy / od) * push;
        }
      }
      mx += sx * this.separationWeight;
      my += sy * this.separationWeight;

      const ml = Math.hypot(mx, my) || 1;
      e.x += (mx / ml) * e.speed * dt;
      e.y += (my / ml) * e.speed * dt;
      // v0.10.0 击退：独立于追踪，指数衰减（时间常数 ~0.35s），Boss 不受击退
      if (e.knockX !== 0 || e.knockY !== 0) {
        const kf = Math.exp(-6.5 * dt);
        e.x += e.knockX * dt;
        e.y += e.knockY * dt;
        e.knockX *= kf;
        e.knockY *= kf;
        if (Math.abs(e.knockX) < 1 && Math.abs(e.knockY) < 1) { e.knockX = 0; e.knockY = 0; }
      }
      e.x = Phaser.Math.Clamp(e.x, 0, WORLD_W);
      e.y = Phaser.Math.Clamp(e.y, 0, WORLD_H);

      e.sprite.setPosition(e.x, e.y);
      e.sprite.setFlipX(e.x > px);

      if (e.orbitCd > 0) e.orbitCd -= dt;

      if (e.flash > 0) {
        e.flash -= dt;
        if (e.flash <= 0) e.sprite.clearTint();
      }
    }
  }

  // 沿 (dx,dy) 方向给敌人击退初速；Boss 免疫
  knock(e: Enemy, dx: number, dy: number, power: number): void {
    if (!e.active || e.isBoss) return;
    const l = Math.hypot(dx, dy) || 1;
    e.knockX += (dx / l) * power;
    e.knockY += (dy / l) * power;
  }

  // 造成伤害；返回是否击杀
  damage(e: Enemy, amount: number): boolean {
    e.hp -= amount;
    e.flash = 0.11;   // v0.10.0: 闪白稍长，命中感更清晰
    e.sprite.setTint(0xffffff);
    if (e.hp <= 0) {
      if (this.onKill) this.onKill(e);
      this.pool.release(e);
      return true;
    }
    return false;
  }

  get live(): Enemy[] { return this.pool.live; }
  get hashRef(): SpatialHash<Enemy> { return this.hash; }
  get count(): number { return this.pool.activeCount; }
}
