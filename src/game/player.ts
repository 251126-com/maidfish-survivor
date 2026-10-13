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
import { WORLD_W, WORLD_H, ARMOR_MAX, STARTER_ARMOR } from '../config/balance.ts';
import type { PlayerStats } from '../config/upgrades.ts';
import { applyBowlPickup, absorbDamage, type ArmorState } from './armor.ts';
import { healClamp } from './collectibles.ts';
import {
  faceScreenOffset, pickExpression, blinkState, gunPose, gunRecoilOffset,
  GUN_ANCHOR, type ExpressionState
} from './playerFx.ts';

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
  // v0.11.0 水母麻痹：短暂减速（slowT 剩余秒 / slowFactor 速度倍率）
  slowT = 0;
  slowFactor = 1;
  private baseScale: number;
  private bowlScale: number;

  // v0.9.0 分层表现：表情叠加层 + 蓝色鲸鱼枪（程序化贴图，锚定真实面部/手部）
  private fx!: Phaser.GameObjects.Image;
  private gun!: Phaser.GameObjects.Image;
  private fxState: ExpressionState = 'idle';
  private readonly fxOff = faceScreenOffset(DISPLAY_H);
  private aimTarget: { x: number; y: number } | null = null;
  private firingTimer = 0;
  private alertFlag = false;
  private winFlag = false;
  private loseFlag = false;
  private gunRecoil = 0;      // 开火后坐（px，指数衰减）
  // v0.13.0 连杀热度（0..n）：枪口火焰随连杀变红
  private streak = 0;

  constructor(scene: Phaser.Scene, stats: PlayerStats) {
    this.scene = scene;
    this.stats = stats;
    this.armor = { armor: STARTER_ARMOR, max: ARMOR_MAX };  // v0.10.0 开局自带护盾
    this.sprite = scene.add.image(this.x, this.y, 'player_whale');
    this.baseScale = DISPLAY_H / Math.max(1, this.sprite.height);
    this.sprite.setScale(this.baseScale);
    this.sprite.setDepth(20);

    // 程序化饭盆：独立 sprite，由 update() 每帧跟随角色变换
    this.bowlSpr = scene.add.image(this.x, this.y - BOWL_HEAD_OFFSET, 'rice_bowl');
    this.bowlScale = BOWL_DISPLAY_H / Math.max(1, this.bowlSpr.height);
    this.bowlSpr.setScale(this.bowlScale * this.baseScale);
    this.bowlSpr.setDepth(21);
    this.bowlSpr.setVisible(STARTER_ARMOR > 0);   // 开局护盾也显示饭盆头

    // 表情叠加层：锚定脸部中心（素材像素分析锚点），深度高于身体、低于饭盆
    this.fx = scene.add.image(this.x + this.fxOff.cx, this.y + this.fxOff.cy, 'fx_idle');
    this.fx.setDepth(21).setOrigin(0.5);

    // 蓝色鲸鱼枪：铰接在右手侧，随最近敌人瞄准/翻转/后坐
    const gunOriginX = 48 / 110;   // 枪把在贴图(110x60 2x)中的比例
    const gunOriginY = 44 / 60;
    this.gun = scene.add.image(this.x, this.y, 'player_gun')
      .setOrigin(gunOriginX, gunOriginY)
      .setDepth(20.6);
  }

  // 枪把（角色握持处）相对 sprite 中心的显示偏移（px）
  private handOffset(): { hx: number; hy: number } {
    const s = DISPLAY_H / GUN_ANCHOR.imgH;
    return {
      hx: (GUN_ANCHOR.handle.x - GUN_ANCHOR.imgW / 2) * s,
      hy: (GUN_ANCHOR.handle.y - GUN_ANCHOR.imgH / 2) * s
    };
  }

  update(dt: number, dirX: number, dirY: number): void {
    this.animT += dt;
    const moving = dirX !== 0 || dirY !== 0;

    if (this.slowT > 0) this.slowT -= dt;
    const effSpeed = this.stats.speed * (this.slowT > 0 ? this.slowFactor : 1);
    if (moving) {
      this.x += dirX * effSpeed * dt;
      this.y += dirY * effSpeed * dt;
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

    // —— v0.9.0 表情叠加层：跟随角色位移/缩放/翻面/无敌帧闪烁 ——
    this.firingTimer -= dt;
    this.gunRecoil *= Math.pow(0.0005, dt);
    const expr = pickExpression({
      moving,
      firing: this.firingTimer > 0,
      hurt: this.flash > 0 || this.invuln > 0,
      alert: this.alertFlag,
      win: this.winFlag,
      lose: this.loseFlag
    });
    // 仅 idle 态叠加帧率无关眨眼
    let key = `fx_${expr}`;
    if (expr === 'idle' && blinkState(this.animT)) key = 'fx_blink';
    if (this.fxState !== expr) {
      this.fxState = expr;
      this.fx.setTexture(key);
    }
    const kx = this.sprite.scaleX / this.baseScale;
    const ky = this.sprite.scaleY / this.baseScale;
    this.fx.setPosition(this.sprite.x + this.fxOff.cx * kx, this.sprite.y + this.fxOff.cy * ky);
    this.fx.setScale(0.5 * kx, 0.5 * ky);
    this.fx.setFlipX(this.facing < 0);
    this.fx.setAlpha(this.sprite.alpha);

    // —— 持枪：瞄准最近敌人 / 翻转 / 后坐 ——
    const ho = this.handOffset();
    const hx = this.sprite.x + ho.hx * (this.facing < 0 ? -1 : 1);
    const hy = this.sprite.y + ho.hy;
    let aimAngle = 0;
    if (this.aimTarget) {
      const dx = this.aimTarget.x - hx;
      const dy = this.aimTarget.y - hy;
      aimAngle = Math.atan2(dy, dx);
    }
    const pose = gunPose(this.facing < 0 ? -1 : 1, aimAngle);
    const recoil = gunRecoilOffset(aimAngle, this.gunRecoil, this.facing < 0 ? -1 : 1);
    this.gun.setPosition(hx + recoil.rx, hy + recoil.ry);
    this.gun.setRotation(pose.rotation);
    this.gun.setFlipX(pose.flipX);
    this.gun.setScale(0.5 * kx, 0.5 * ky);
    this.gun.setAlpha(this.sprite.alpha);
  }

  // 开火后坐：武器每开火一次调用（由 WeaponSystem 接入）
  // 触发身体后坐 + 枪口后坐 + 射击表情短暂保留
  onFire(): void {
    this.recoilX = this.facing * -4;
    this.gunRecoil = 5;
    this.firingTimer = 0.09;
    // v0.13.0 连杀越高枪口火焰越红（tint 强度随 streak 映射）
    this.applyStreakTint();
  }

  /** v0.13.0 设置当前连杀数（GameScene 每次击杀后调用）；0 清零时清除枪口染色 */
  setStreak(n: number): void {
    this.streak = Math.max(0, Math.floor(n));
    if (this.streak <= 0) this.gun.clearTint();
  }

  // 枪口火焰变红：白 → 红橙按热度(0..15 封顶)插值
  private applyStreakTint(): void {
    const heat = Math.min(1, this.streak / 15);
    if (heat <= 0) { this.gun.clearTint(); return; }
    const r = Math.round(255 - heat * 70);
    const g = Math.round(255 - heat * 215);
    const b = Math.round(255 - heat * 238);
    this.gun.setTint((r << 16) | (g << 8) | b);
  }

  /** 瞄准目标（最近敌人）；由 GameScene 每帧设置，未设则枪朝正右 */
  setAimTarget(x: number | null, y: number | null): void {
    if (x === null || y === null) { this.aimTarget = null; return; }
    this.aimTarget = { x, y };
  }

  /** v0.11.0 水母麻痹：进入减速状态（更低的因子优先、时长取较大值） */
  applySlow(dur: number, factor: number): void {
    if (dur <= 0 || factor >= 1) return;
    if (this.slowT <= 0 || factor < this.slowFactor) {
      this.slowT = dur;
      this.slowFactor = factor;
    } else {
      this.slowT = Math.max(this.slowT, dur);
    }
  }

  /** Boss 预警/阶段切换：警觉表情 */
  setAlert(v: boolean): void { this.alertFlag = v; }

  /** 胜利/失败表情（结算前最后一帧可见） */
  setWin(v: boolean): void { this.winFlag = v; this.loseFlag = false; }
  setLose(v: boolean): void { this.loseFlag = v; this.winFlag = false; }

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
    // v0.9.1: 破甲tint以本次受伤是否被护甲吸收为准(absorbed>0)
    this.sprite.setTint(r.absorbed > 0 ? 0xff9a5c : 0xff6b6b);
    if (this.bowlSpr.visible) this.bowlSpr.setTint(r.absorbed > 0 ? 0xff9a5c : 0xff6b6b);
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

  private destroyed = false;

  // v0.9.1: idempotent destroy, safe for repeated calls
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.sprite.destroy();
    this.bowlSpr.destroy();
    this.fx.destroy();
    this.gun.destroy();
  }
}
