// 浮动伤害数字：对象池复用，命中/暴击时在敌人位置弹出
// 暴击用更大字号 + 金色，普通伤害白色，带描边保证任何背景都可读
import Phaser from 'phaser';
import { POOL_LIMIT } from '../config/balance.ts';

interface DmgTextItem {
  obj: Phaser.GameObjects.Text;
  life: number;
  vy: number;
  age: number;     // 已存活时间（秒）：驱动弹出弹跳
  crit: boolean;
}

export class DamageTextSystem {
  private scene: Phaser.Scene;
  private pool: DmgTextItem[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(x: number, y: number, amount: number, opts: { crit?: boolean } = {}): void {
    let item: DmgTextItem | null = null;
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].obj.visible) { item = this.pool[i]; break; }
    }
    if (!item) {
      if (this.pool.length >= POOL_LIMIT.damageText) return;   // 达到预算上限则丢弃，保证帧率
      const obj = this.scene.add.text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#0a1420',
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(35);
      obj.setVisible(false);
      item = { obj, life: 0, vy: 0, age: 0, crit: false };
      this.pool.push(item);
    }

    const crit = !!opts.crit;
    // v0.13.0: 暴击黄字更大字号（30px），普通白字 16px
    item.obj.setText(crit ? `暴击 ${Math.round(amount)}` : `${Math.round(amount)}`);
    item.obj.setFontSize(crit ? 30 : 16);
    item.obj.setColor(crit ? '#ffd447' : '#ffffff');
    item.obj.setPosition(x + (Math.random() * 18 - 9), y - 6);
    item.obj.setVisible(true);
    item.obj.setAlpha(1);
    item.obj.setScale(0.4);                  // 弹出起点：小 → 蹦出
    item.life = crit ? 0.95 : 0.7;
    item.vy = crit ? -90 : -65;
    item.age = 0;
    item.crit = crit;
  }

  update(dt: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const it = this.pool[i];
      if (!it.obj.visible) continue;
      it.life -= dt;
      it.age += dt;
      it.vy -= 160 * dt;                     // 轻微上抛后回落
      it.obj.y += it.vy * dt;
      // v0.13.0 缩放弹跳蹦出（yoyo）：0.4 → 1.15 过冲 → 回落 1.0，后半段不再变化
      const pop = Math.max(0, 1 - it.age / 0.22);
      const overshoot = Math.sin(it.age * 26) * 0.18 * pop;
      const scale = Phaser.Math.Clamp(0.4 + 0.75 * Math.min(1, it.age * 14) + overshoot, 0.4, 1.3);
      it.obj.setScale(scale);
      it.obj.setAlpha(Phaser.Math.Clamp(it.life / 0.25, 0, 1));   // 末尾渐隐，不原地消失
      if (it.life <= 0) {
        it.obj.setVisible(false);
        it.obj.setScale(1);
      }
    }
  }

  get visibleCount(): number {
    let n = 0;
    for (let i = 0; i < this.pool.length; i++) if (this.pool[i].obj.visible) n++;
    return n;
  }
}
