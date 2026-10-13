// v0.10.0 击杀爆散粒子：对象池复用的程序化圆点，克制数量（鱼 5 粒 / 疾行 5 / 肥鱼 10 / Boss 30）。
// 原则：短促、淡出、返回静止，不常驻；普通击杀不触发震屏（避免糊屏）。
// killFxSpec 是纯函数，便于单测。
import Phaser from 'phaser';
import { POOL_LIMIT } from '../config/balance.ts';
import { killFxSpec } from './killFxSpec.ts';


interface P {
  obj: Phaser.GameObjects.Arc;
  vx: number; vy: number;
  life: number; max: number;
  g: number;       // 重力（轻微下坠）
}

export class DeathFx {
  private scene: Phaser.Scene;
  private pool: P[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // 在 (x,y) 播放敌人类型对应的爆散
  burst(x: number, y: number, defId: string): void {
    const spec = killFxSpec(defId);
    const colors = spec.colors;
    for (let i = 0; i < spec.count; i++) {
      const p = this.acquire();
      if (!p) return;
      p.obj.setPosition(x, y);
      p.obj.setFillStyle(colors[Math.floor(Math.random() * colors.length)], 1);
      const a = Math.random() * Math.PI * 2;
      const sp = spec.speed[0] + Math.random() * (spec.speed[1] - spec.speed[0]);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - 30;
      p.max = p.life = 0.35 + Math.random() * 0.3;
      p.g = 220;
      p.obj.setAlpha(1);
      p.obj.setScale(spec.size / 6);
      p.obj.setVisible(true);
    }
  }

  // 命中火花（暴击/重击），数量更少
  spark(x: number, y: number, count = 3): void {
    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      if (!p) return;
      p.obj.setPosition(x, y);
      p.obj.setFillStyle(0xffffff, 1);
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 90;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.max = p.life = 0.18 + Math.random() * 0.12;
      p.g = 60;
      p.obj.setAlpha(1);
      p.obj.setScale(0.5);
      p.obj.setVisible(true);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.obj.visible) continue;
      p.life -= dt;
      p.vy += p.g * dt;
      p.obj.x += p.vx * dt;
      p.obj.y += p.vy * dt;
      const k = Phaser.Math.Clamp(p.life / p.max, 0, 1);
      p.obj.setAlpha(k);
      p.obj.setScale(p.obj.scale * (0.5 + 0.5 * k));
      if (p.life <= 0) p.obj.setVisible(false);
    }
  }

  private acquire(): P | null {
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].obj.visible) return this.pool[i];
    }
    if (this.pool.length >= POOL_LIMIT.deathFx) return null;
    const obj = this.scene.add.circle(0, 0, 6, 0xffffff, 1).setDepth(24).setVisible(false);
    const p: P = { obj, vx: 0, vy: 0, life: 0, max: 1, g: 0 };
    this.pool.push(p);
    return p;
  }

  get visibleCount(): number {
    let n = 0;
    for (let i = 0; i < this.pool.length; i++) if (this.pool[i].obj.visible) n++;
    return n;
  }
}
