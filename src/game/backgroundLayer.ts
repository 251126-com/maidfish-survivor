// 固定屏幕背景层：四张授权背景按周期切换，低开销。
// 设计：
//  - 四张图全部 preload，作为 scrollFactor(0) 的固定屏幕层（depth 0），
//    不随 4000x4000 相机滚动，无 TileSprite/大渲染纹理 → 移动端无内存尖峰。
//  - 开局可选随机轮换起始背景（startIndex），之后每 BG_SWITCH_SEC 秒循环切下一张；
//    HUD「场景」按钮可手动 next() 调下一张（关卡切换明确）。
//  - 旧图淡出、新图淡入（各自独立单目标 tween，避开 v0.5.0/0.5.1 修过的数组目标 bug）。
//  - 统一暗色遮罩（depth 2）压低背景亮度，角色/弹幕/敌人/HUD 都渲染在其上。
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config/balance.ts';
import { BG_ORDER, BG_SWITCH_SEC, BG_FADE, BG_MASK_ALPHA, activeBgIndex, manualHoldUntil } from '../config/background.ts';
import { coverFit } from '../config/cover.ts';

// 遮罩深度：在背景(0)和世界边框(1)之上、世界对象(>=5)之下
const MASK_DEPTH = 2;

export class BackgroundLayer {
  /** 当前活动背景的时间轴索引（-1 = 尚未初始化） */
  activeIndex = -1;
  /** 当前活动背景的纹理 key（供 HUD/e2e 断言） */
  get activeKey(): string {
    return this.activeIndex >= 0 ? BG_ORDER[this.activeIndex].key : '';
  }
  /** 当前活动背景的中文名（供菜单/切景提示/e2e） */
  get activeName(): string {
    return this.activeIndex >= 0 ? BG_ORDER[this.activeIndex].name : '';
  }

  /** 开局起始下标（可能是随机/菜单选关） */
  readonly startIndex: number;

  /** 背景切换回调（切换开始时调用）：GameScene 借此弹提示 */
  onSwitch: ((key: string, name: string) => void) | null = null;

  /** 手动切换后的保持窗口截止秒数（<0 = 未保持，完全由时间轴驱动）。
      手动 next 语义等价于时间轴前进一格，故保持一个 BG_SWITCH_SEC 后自然接回时间轴。 */
  private holdUntilSec = -1;

  private scene: Phaser.Scene;
  private images: Phaser.GameObjects.Image[] = [];
  private mask: Phaser.GameObjects.Rectangle;
  private tweens: Phaser.Tweens.Tween[] = [];

  constructor(scene: Phaser.Scene, startIndex = 0) {
    this.scene = scene;
    this.startIndex = startIndex;
    this.mask = scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x071524, BG_MASK_ALPHA)
      .setScrollFactor(0)
      .setDepth(MASK_DEPTH);

    BG_ORDER.forEach((phase, i) => {
      const tex = scene.textures.get(phase.key);
      const sw = tex.getSourceImage().width;
      const sh = tex.getSourceImage().height;
      const cover = coverFit(sw, sh, GAME_W, GAME_H);
      const img = scene.add.image(0, 0, phase.key)
        .setOrigin(0, 0)
        .setDisplaySize(cover.w, cover.h)
        .setScrollFactor(0)
        .setDepth(0)
        .setAlpha(i === startIndex ? 1 : 0);
      this.images.push(img);
    });
    this.activeIndex = startIndex;
  }

  /** 每帧调用：elapsed 跨过切换点就交叉淡入淡出。
      手动切换后的保持窗口内（elapsed < holdUntilSec）不做时间轴纠偏。 */
  update(elapsedSec: number): void {
    if (elapsedSec < this.holdUntilSec) return;
    if (this.holdUntilSec >= 0) this.holdUntilSec = -1;
    const idx = activeBgIndex(elapsedSec, this.startIndex);
    if (idx === this.activeIndex) return;
    this.switchTo(idx);
  }

  /** 手动切到下一张（HUD「场景」按钮/悬浮面板暂停态入口）：按循环顺序前进。
      手动切换后保持一个切换周期，避免下一帧时间轴立即纠偏拉回。 */
  next(elapsedSec: number): void {
    this.switchTo((this.activeIndex + 1) % BG_ORDER.length);
    this.holdUntilSec = manualHoldUntil(elapsedSec);
  }

  private switchTo(to: number): void {
    const from = this.activeIndex;
    if (to === from) return;
    this.activeIndex = to;
    this.crossFade(from, to);
    if (this.onSwitch) this.onSwitch(this.activeKey, this.activeName);
  }

  private crossFade(from: number, to: number): void {
    const scene = this.scene;
    // 中断进行中的切换，防止多段 tween 叠加
    for (const t of this.tweens) t.stop();
    this.tweens.length = 0;
    for (const img of this.images) scene.tweens.killTweensOf(img);

    const out = scene.tweens.add({
      targets: this.images[from],
      alpha: 0,
      duration: BG_FADE.outMs,
      ease: 'Sine.easeIn'
    });
    const inn = scene.tweens.add({
      targets: this.images[to],
      alpha: 1,
      duration: BG_FADE.inMs,
      ease: 'Sine.easeOut'
    });
    this.tweens.push(out, inn);
  }

  destroy(): void {
    for (const t of this.tweens) t.stop();
    this.tweens.length = 0;
    for (const img of this.images) {
      this.scene.tweens.killTweensOf(img);
      img.destroy();
    }
    this.images.length = 0;
    this.mask.destroy();
  }
}
