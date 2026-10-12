// 武器系统：数据驱动。支持多武器同时开火 + 环绕类武器
// 索敌用敌人空间哈希，避免每帧 O(n) 全表扫描
import Phaser from 'phaser';
import { EntityPool, type Poolable } from '../core/pool.ts';
import { WEAPONS, type WeaponDef, type WeaponLevelDef } from '../config/weapons.ts';
import { POOL_LIMIT } from '../config/balance.ts';
import type { Player } from './player.ts';
import type { EnemySystem, Enemy } from './enemySystem.ts';

export class Bullet implements Poolable {
  active = false;
  x = 0; y = 0;
  vx = 0; vy = 0;
  damage = 0;
  pierce = 0;
  radius = 6;
  life = 2;
  isSniper = false;
  hitUids: number[] = [];   // 已命中敌人 uid，防穿透重复扣血
  sprite!: Phaser.GameObjects.Image;

  spawn(): void { this.hitUids.length = 0; this.life = 2; }
  despawn(): void { this.sprite.setVisible(false); }
}

export class OwnedWeapon {
  def: WeaponDef;
  level = 1;      // 1-based
  cd = 0;         // 剩余冷却秒

  constructor(def: WeaponDef) { this.def = def; }
  get stats(): WeaponLevelDef { return this.def.levels[Math.min(this.level, this.def.maxLevel) - 1]; }
  get maxed(): boolean { return this.level >= this.def.maxLevel; }
}

export class WeaponSystem {
  private scene: Phaser.Scene;
  readonly owned: OwnedWeapon[] = [];
  private bulletPool: EntityPool<Bullet>;
  private finSprites: Phaser.GameObjects.Image[] = [];
  private finAngle = 0;
  private neighborBuf: Enemy[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bulletPool = new EntityPool<Bullet>(() => {
      const b = new Bullet();
      b.sprite = scene.add.image(0, 0, 'bullet');
      b.sprite.setVisible(false);
      b.sprite.setDepth(15);
      return b;
    }, POOL_LIMIT.bullet);
  }

  addWeapon(id: string): boolean {
    if (this.owned.some(w => w.def.id === id)) return false;
    const def = WEAPONS[id];
    if (!def) return false;
    this.owned.push(new OwnedWeapon(def));
    return true;
  }

  hasWeapon(id: string): boolean { return this.owned.some(w => w.def.id === id); }

  upgradeWeapon(id: string): boolean {
    const w = this.owned.find(o => o.def.id === id);
    if (!w || w.maxed) return false;
    w.level++;
    return true;
  }

  // 供 UI 展示的环绕武器（tail）需要几个尾鳍
  private ensureFins(count: number): void {
    while (this.finSprites.length < count) {
      const s = this.scene.add.image(0, 0, 'fin');
      s.setDepth(19);
      this.finSprites.push(s);
    }
    for (let i = 0; i < this.finSprites.length; i++) {
      this.finSprites[i].setVisible(i < count);
    }
  }

  update(dt: number, player: Player, enemies: EnemySystem): void {
    // 开火
    for (let i = 0; i < this.owned.length; i++) {
      const w = this.owned[i];
      if (w.def.id === 'tail') continue;   // 环绕武器单独处理
      w.cd -= dt;
      if (w.cd > 0) continue;
      const target = this.findNearest(player.x, player.y, w.stats.range, enemies);
      if (!target) continue;
      w.cd = w.stats.cooldown;
      this.fire(w, player, target);
    }

    this.updateOrbit(dt, player, enemies);
    this.updateBullets(dt, enemies, player);
  }

  private fire(w: OwnedWeapon, player: Player, target: Enemy): void {
    const s = w.stats;
    const baseAngle = Math.atan2(target.y - player.y, target.x - player.x);
    const spread = 0.14;   // 多发时的扇形间隔
    for (let i = 0; i < s.count; i++) {
      const offset = s.count > 1 ? (i - (s.count - 1) / 2) * spread : 0;
      const a = baseAngle + offset;
      const b = this.bulletPool.acquire();
      if (!b) return;
      b.x = player.x;
      b.y = player.y;
      b.vx = Math.cos(a) * s.speed;
      b.vy = Math.sin(a) * s.speed;
      b.damage = s.damage * player.stats.damageMult;
      b.pierce = s.pierce;
      b.radius = w.def.id === 'sniper' ? 10 : 6;
      b.isSniper = w.def.id === 'sniper';
      b.sprite.setTexture(b.isSniper ? 'bullet_sniper' : 'bullet');
      b.sprite.setPosition(b.x, b.y);
      b.sprite.setRotation(a);
      b.sprite.setVisible(true);
    }
  }

  private updateBullets(dt: number, enemies: EnemySystem, player: Player): void {
    const live = this.bulletPool.live;
    for (let i = 0; i < live.length; i++) {
      const b = live[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) { this.bulletPool.release(b); continue; }

      b.sprite.setPosition(b.x, b.y);

      // 与敌人碰撞
      // 注意：查询半径必须覆盖"单帧位移 + 敌人半径"，否则低帧率时子弹会穿过敌人。
      // 最快子弹 1200px/s，dt 上限 0.05s → 单帧最多 60px，这里留 70px 余量。
      this.neighborBuf.length = 0;
      enemies.hashRef.queryCircle(b.x, b.y, b.radius + 70, this.neighborBuf);
      for (let j = 0; j < this.neighborBuf.length; j++) {
        const e = this.neighborBuf[j];
        if (!e.active) continue;
        if (b.hitUids.indexOf(e.uid) !== -1) continue;
        const rr = b.radius + e.radius;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        if (dx * dx + dy * dy > rr * rr) continue;

        b.hitUids.push(e.uid);
        this.applyDamage(e, b.damage, enemies, player);
        b.pierce--;
        if (b.pierce <= 0) { this.bulletPool.release(b); break; }
      }
    }
  }

  // 鲨尾环绕：尾鳍绕玩家旋转，碰到敌人造成伤害（每敌人有独立冷却）
  private updateOrbit(dt: number, player: Player, enemies: EnemySystem): void {
    const w = this.owned.find(o => o.def.id === 'tail');
    if (!w) {
      for (const s of this.finSprites) s.setVisible(false);
      return;
    }
    const s = w.stats;
    this.ensureFins(s.count);
    this.finAngle += s.speed * dt;
    if (this.finAngle > Math.PI * 2) this.finAngle -= Math.PI * 2;

    for (let i = 0; i < s.count; i++) {
      const a = this.finAngle + (Math.PI * 2 * i) / s.count;
      const fx = player.x + Math.cos(a) * s.range;
      const fy = player.y + Math.sin(a) * s.range;
      const fin = this.finSprites[i];
      fin.setPosition(fx, fy);
      fin.setRotation(a + Math.PI / 2);

      // 命中判定
      this.neighborBuf.length = 0;
      enemies.hashRef.queryCircle(fx, fy, 24, this.neighborBuf);
      for (let j = 0; j < this.neighborBuf.length; j++) {
        const e = this.neighborBuf[j];
        if (!e.active) continue;
        const rr = 22 + e.radius;
        const dx = e.x - fx;
        const dy = e.y - fy;
        if (dx * dx + dy * dy > rr * rr) continue;
        if (e.orbitCd > 0) continue;
        e.orbitCd = s.cooldown;
        this.applyDamage(e, s.damage * player.stats.damageMult, enemies, player);
      }
    }
  }

  private applyDamage(e: Enemy, base: number, enemies: EnemySystem, player: Player): void {
    let dmg = base;
    if (Math.random() < player.stats.critChance) dmg *= player.stats.critMult;
    enemies.damage(e, dmg);
  }

  private findNearest(x: number, y: number, range: number, enemies: EnemySystem): Enemy | null {
    this.neighborBuf.length = 0;
    enemies.hashRef.queryCircle(x, y, range, this.neighborBuf);
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (let i = 0; i < this.neighborBuf.length; i++) {
      const e = this.neighborBuf[i];
      if (!e.active) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  get bulletCount(): number { return this.bulletPool.activeCount; }
  get bullets(): Bullet[] { return this.bulletPool.live; }
}