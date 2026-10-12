// 玩家控制器：移动、受击、无敌帧、朝向翻转
import Phaser from 'phaser';
import { WORLD_W, WORLD_H } from '../config/balance.ts';
import type { PlayerStats } from '../config/upgrades.ts';

export class Player {
  readonly sprite: Phaser.GameObjects.Image;
  stats: PlayerStats;

  x = WORLD_W / 2;
  y = WORLD_H / 2;
  radius = 15;          // 受击判定半径（比贴图略小，手感更宽容）
  invuln = 0;           // 受击无敌剩余秒数
  private flash = 0;    // 受击闪白剩余秒数
  private facing = 1;

  constructor(scene: Phaser.Scene, stats: PlayerStats) {
    this.stats = stats;
    this.sprite = scene.add.image(this.x, this.y, 'player_maid');
    this.sprite.setDepth(20);
  }

  update(dt: number, dirX: number, dirY: number): void {
    if (dirX !== 0 || dirY !== 0) {
      this.x += dirX * this.stats.speed * dt;
      this.y += dirY * this.stats.speed * dt;
      // 限制在世界内
      this.x = Phaser.Math.Clamp(this.x, 24, WORLD_W - 24);
      this.y = Phaser.Math.Clamp(this.y, 24, WORLD_H - 24);
      // 朝向翻转
      if (dirX < -0.15 && this.facing !== -1) { this.facing = -1; this.sprite.setFlipX(true); }
      else if (dirX > 0.15 && this.facing !== 1) { this.facing = 1; this.sprite.setFlipX(false); }
    }

    this.sprite.setPosition(this.x, this.y);

    if (this.invuln > 0) this.invuln -= dt;
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) this.sprite.clearTint();
    }
  }

  // 返回是否真的受到伤害（无敌帧内免疫）
  takeDamage(dmg: number): boolean {
    if (this.invuln > 0) return false;
    this.stats.hp -= dmg;
    this.invuln = 0.6;
    this.flash = 0.15;
    this.sprite.setTint(0xff6b6b);
    return true;
  }

  heal(amount: number): void {
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + amount);
  }

  get alive(): boolean {
    return this.stats.hp > 0;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}