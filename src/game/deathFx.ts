// v0.10.0 击杀爆散粒子：对象池复用的程序化圆点，克制数量（鱼 5 粒 / 疾行 5 / 肥鱼 10 / Boss 30）。
// v0.13.0 改为「深海冒泡溶解」：粒子上升（vy 向上）+ 持续膨胀放大 + 透明消散，
// 贴合鲸鱼娘深海世界观；Boss 保留外圈爆发在此基础上混合。
// 原则：短促、淡出、返回静止，不常驻；普通击杀不触发震屏（避免糊屏）。
// killFxSpec 是纯函数，便于单测。
import Phaser from 'phaser';
import { POOL_LIMIT } from '../config/balance.ts';
import { killFxSpec } from './killFxSpec.ts';


interface P {
  obj: Phaser.GameObjects.Arc;
  vx: number; vy: number;
  life: number; max: number;
  g: number;       // 重力（气泡轻微上浮加速度，负=上升）
  grow: number;    // 单帧膨胀系数
  baseR: number;   // 起始半径
}

export class DeathFx {
  private scene: Phaser.Scene;
  private pool: P[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // 在 (x,y) 播放敌人类型对应的冒泡溶解
  burst(x: number, y: number, defId: string): void {
    const spec = killFxSpec(defId);
    const colors = spec.colors;
    for (let i = 0; i < spec.count; i++) {
      const p = this.acquire();
      if (!p) return;
      p.obj.setPosition(x + (Math.random() * 18 - 9), y + (Math.random() * 18 - 9));
      p.obj.setFillStyle(colors[Math.floor(Math.random() * colors.length)], 1);
      // 气泡：主升上浮 + 轻微水平漂移，Boss/大鱼外圈可加一点横向爆发
      const angle = Math.random() * Math.PI * 2;
      const sp = spec.speed[0] + Math.random() * (spec.speed[1] - spec.speed[0]);
      const isBoss = defId === 'boss';
      p.vx = Math.cos(angle) * sp * (isBoss ? 0.75 : 0.25);
      p.vy = Math.sin(angle) * sp * (isBoss ? 0.5 : 0.2) - (40 + Math.random() * 55);  // 向上为主
      p.max = p.life = 0.5 + Math.random() * 0.45;
      p.g = -55;                 // 上升加速度（深海浮力）
      p.grow = 1 + Math.random() * 0.9;
      p.baseR = spec.size / 6;
      p.obj.setAlpha(1);
      p.obj.setScale(p.baseR);
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
      if (p.vy < 60) p.vy += p.g * dt;          // 上浮加速度（封顶避免飞太快）
      p.obj.x += p.vx * dt;
      p.obj.y += p.vy * dt;
      const k = Phaser.Math.Clamp(p.life / p.max, 0, 1);
      p.obj.setAlpha(k * k);                     // 透明消散（后半程更快变透明）
      p.obj.setScale(Math.min(3.2, p.baseR * p.grow * (1.6 - k) + 0.2));  // 膨胀：越到后期越大
      if (p.life <= 0) p.obj.setVisible(false);
    }
  }

  private acquire(): P | null {
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].obj.visible) return this.pool[i];
    }
    if (this.pool.length >= POOL_LIMIT.deathFx) return null;
    const obj = this.scene.add.circle(0, 0, 6, 0xffffff, 1).setDepth(24).setVisible(false);
    const p: P = { obj, vx: 0, vy: 0, life: 0, max: 1, g: 0, grow: 1, baseR: 1 };
    this.pool.push(p);
    return p;
  }

  get visibleCount(): number {
    let n = 0;
    for (let i = 0; i < this.pool.length; i++) if (this.pool[i].obj.visible) n++;
    return n;
  }
}
