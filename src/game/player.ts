// 玩家控制器：移动、受击、无敌帧、朝向翻转 + 程序化动作
// 角色素材 = 用户设计图抠出的透明 PNG（不重新设计角色）；
// 动作全部用代码程序化生成：移动 bob、行走倾斜、待机呼吸、
// 开火后坐、受击挤压/后仰/闪红——不是手绘帧，不生成新造型。
//
// v0.7.0 饭盆护甲：
//  - 拾取饭盆 → 获得/刷新 30 护甲，头顶出现程序化「大白饭饭盆」overlay；
//  - 受伤优先扣护甲，护甲破碎 → overlay 消失（恢复普通角色立绘）+ 破碎粒子。
// 说明：用户素材为不透明设计稿，本处采用忠实程序化饭盆 overlay 而非完整换图。
import Phaser from 'phaser';
import { WORLD_W, WORLD_H, ARMOR_MAX } from '../config/balance.ts';
import type { PlayerStats } from '../config/upgrades.ts';
import { applyBowlPickup, absorbDamage, type ArmorState } from './armor.ts';
import { healClamp } from './collectibles.ts';

// 角色在屏幕上显示的高度（px）。素材原图 320 高，等比缩放。
const DISPLAY_H = 112;
// 饭盆 overlay 显示高度（px）；头顶偏移量（角色中心向上）
const BOWL_DISPLAY_H = 54;
const BOWL_HEAD_OFFSET = 50;

export class Player {
  readonly sprite: Phaser.GameObjects.Image;
  stats: PlayerStats;
  /** 饭盆护甲状态（纯逻辑，单测见 armor.ts） */
  readonly armor: ArmorState;
  /** 程序化饭盆 overlay：有护甲时显示在头顶，跟随角色翻面/动作 */
  readonly bowlSpr: Phaser.GameObjects.Image;

  x = WORLD_W / 2;
  y = WORLD_H / 2;
  radius = 15;          // 受击判定半径（比贴图略小，手感更宽容）
  invuln = 0;           // 受击无敌剩余秒数
  private scene: Phaser.Scene;
  private flash = 0;    // 受击闪红剩余秒数
  private facing = 1;
  private animT = 0;    // 动作时钟（秒）
  private recoilX = 0;  // 开火后坐位移（px，指数衰减回原位）
  private hitSquash = 0;// 受击挤压系数 0..1（指数衰减）
  private hitKnockX = 0;// 受击后仰位移：沿命中来源反向弹开（指数衰减）
  private hitKnockY = 0;
  private baseScale: number;
  private bowlScale: number;

  constructor(scene: Phaser.Scene, stats: PlayerStats) {
    this.scene = scene;
    this.stats = stats;
    this.armor = { armor: 0, max: ARMOR_MAX };
    this.sprite = scene.add.image(this.x, this.y, 'player_whale');
    this.baseScale = DISPLAY_H / Math.max(1, this.sprite.height);
    this.sprite.setScale(this.baseScale);
    this.sprite.setDepth(20);

    // 程序化饭盆：独立 sprite，由 update() 每帧跟随角色变换
    this.bowlSpr = scene.add.image(this.x, this.y - BOWL_HEAD_OFFSET, 'rice_bowl');
    this.bowlScale = BOWL_DISPLAY_H / Math.max(1, this.bowlSpr.height);
    this.bowlSpr.setScale(this.bowlScale * this.baseScale);
    this.bowlSpr.setDepth(21);
    this.bowlSpr.setVisible(false);
  }

  update(dt: number, dirX: number, dirY: number): void {
    this.animT += dt;
    const moving = dirX !== 0 || dirY !== 0;

    if (moving) {
      this.x += dirX * this.stats.speed * dt;
      this.y += dirY * this.stats.speed * dt;
      // 限制在世界内
      this.x = Phaser.Math.Clamp(this.x, 24, WORLD_W - 24);
      this.y = Phaser.Math.Clamp(this.y, 24, WORLD_H - 24);
      // 朝向翻转（用户设计图左右镜像复用同一帧）
      if (dirX < -0.15 && this.facing !== -1) { this.facing = -1; this.sprite.setFlipX(true); }
      else if (dirX > 0.15 && this.facing !== 1) { this.facing = 1; this.sprite.setFlipX(false); }
    }

    // —— 程序化动作 ——
    // 移动 bob：正弦上下浮动，幅度 3.2px
    const bob = moving ? Math.sin(this.animT * 11) * 3.2 : 0;
    // 行走倾斜：横向移动速度越大越向移动方向前倾
    const tilt = moving ? Phaser.Math.Clamp(dirX, -1, 1) * this.facing * 0.06 : 0;
    // 待机轻摆：原地缓慢左右摇摆（约 1.9Hz，幅度 2°），与呼吸叠加成"活着的待机"感
    const sway = moving ? 0 : Math.sin(this.animT * 1.9) * 0.035;
    // 待机呼吸：原地轻微放大缩小（呼吸节奏约 3.5Hz）
    const breathe = moving ? 1 : 1 + Math.sin(this.animT * 3.5) * 0.015;
    // 受击挤压：横向拉宽、纵向压扁，指数快速回弹
    this.hitSquash *= Math.pow(0.0008, dt);
    const sqX = 1 + this.hitSquash * 0.16;
    const sqY = 1 - this.hitSquash * 0.16;
    // 开火后坐：朝开火反方向（即朝向反侧）轻微后退，指数衰减回原位
    this.recoilX *= Math.pow(0.0005, dt);
    // 受击后仰：纯视觉位移（不阻移动），沿命中来源反向弹开，指数衰减回原位
    this.hitKnockX *= Math.pow(0.0008, dt);
    this.hitKnockY *= Math.pow(0.0008, dt);

    this.sprite.setPosition(this.x + this.recoilX + this.hitKnockX, this.y + bob + this.hitKnockY);
    this.sprite.setRotation(tilt + sway);
    const b = this.baseScale * breathe;
    this.sprite.setScale(b * sqX, b * sqY);

    if (this.invuln > 0) {
      this.invuln -= dt;
      // 无敌帧闪烁：配合红色残影，受击"闪红"反馈更清晰
      const blink = Math.floor(this.animT * 22) % 2 === 0;
      this.sprite.setAlpha(blink ? 0.5 : 1);
    } else {
      this.sprite.setAlpha(1);
    }
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) {
        this.sprite.clearTint();
        this.bowlSpr.clearTint();
      }
    }

    // —— 饭盆 overlay 跟随角色翻面/动作 ——
    if (this.bowlSpr.visible) {
      const sx = this.sprite.scaleX;
      const sy = this.sprite.scaleY;
      this.bowlSpr.setPosition(this.sprite.x, this.sprite.y - BOWL_HEAD_OFFSET * sy);
      this.bowlSpr.setRotation(this.sprite.rotation);
      this.bowlSpr.setScale(this.bowlScale * sx, this.bowlScale * sy);
      this.bowlSpr.setFlipX(this.facing < 0);
      this.bowlSpr.setAlpha(this.sprite.alpha);   // 无敌帧闪烁同步
    }
  }

  // 开火后坐：武器每开火一次调用（由 WeaponSystem 接入）
  onFire(): void {
    this.recoilX = this.facing * -4;
  }

  // 返回是否真的受到伤害（无敌帧内免疫）。
  // 受伤优先扣护甲（absorbDamage 纯逻辑），护甲破碎 → 饭盆消失恢复原立绘。
  // fromX/fromY = 命中来源位置（敌人中心），传入后角色朝反方向"后仰"弹开；
  // 不传时按当前朝向的后方弹开（兼容既有一致性测试）。
  takeDamage(dmg: number, fromX?: number, fromY?: number): boolean {
    if (this.invuln > 0) return false;
    const r = absorbDamage(this.armor, dmg);
    this.stats.hp -= r.hpDmg;
    this.invuln = 0.6;
    this.flash = 0.15;
    this.hitSquash = 1;               // 受击挤压
    // 有护甲吸收时用橙红反馈，无护甲用常规红色
    this.sprite.setTint(this.armor.armor > 0 ? 0xff9a5c : 0xff6b6b);
    if (this.bowlSpr.visible) this.bowlSpr.setTint(0xff9a5c);
    // 受击后仰位移：离开命中来源的方向
    let kx = -this.facing, ky = 0;
    if (fromX !== undefined && fromY !== undefined) {
      const dx = this.x - fromX;
      const dy = this.y - fromY;
      const len = Math.hypot(dx, dy);
      if (len > 0.001) { kx = dx / len; ky = dy / len; }
    }
    this.hitKnockX = kx * 15;
    this.hitKnockY = ky * 15;
    if (r.broken) this.breakBowl();   // 破甲 → 恢复普通角色立绘
    return true;
  }

  // 拾取饭盆：'new' 首次获得 / 'refill' 刷新回满 / 'full' 已满无变化（不叠加超上限）
  gainArmor(): 'new' | 'refill' | 'full' {
    const st = applyBowlPickup(this.armor, ARMOR_MAX);
    if (st !== 'full') this.bowlSpr.setVisible(true);
    this.bowlSpr.clearTint();
    return st;
  }

  // 回血：clamp 到最大 HP，返回实际回复量（供拾取反馈文案）
  heal(amount: number): number {
    const before = this.stats.hp;
    this.stats.hp = healClamp(this.stats.hp, this.stats.maxHp, amount);
    return this.stats.hp - before;
  }

  // 破甲：饭盆 overlay 消失 + 白色碎片粒子
  private breakBowl(): void {
    if (!this.bowlSpr.visible) return;
    const bx = this.bowlSpr.x;
    const by = this.bowlSpr.y;
    this.bowlSpr.setVisible(false);
    this.bowlSpr.clearTint();
    for (let i = 0; i < 8; i++) {
      const p = this.scene.add.rectangle(bx, by, 5, 5, 0xf4f0e4);
      p.setDepth(22);
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.6;
      const sp = 60 + Math.random() * 90;
      this.scene.tweens.add({
        targets: p,
        x: bx + Math.cos(a) * sp,
        y: by + Math.sin(a) * sp,
        alpha: 0,
        angle: (Math.random() - 0.5) * 160,
        duration: 420 + Math.random() * 120,
        ease: 'Cubic.easeOut',
        onComplete: () => p.destroy()
      });
    }
  }

  get alive(): boolean { return this.stats.hp > 0; }
  /** 有护甲 → 显示饭盆头外观 */
  get hasBowl(): boolean { return this.armor.armor > 0; }
  get armorValue(): number { return this.armor.armor; }
  get armorMax(): number { return this.armor.max; }

  destroy(): void {
    this.sprite.destroy();
    this.bowlSpr.destroy();
  }
}
