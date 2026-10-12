// 输入系统：触摸拖拽（全屏任意位置按住拖动）+ 键盘（PC 调试）
// 输出归一化方向向量，与移动逻辑解耦
import Phaser from 'phaser';

export class InputSystem {
  private scene: Phaser.Scene;
  private activeId = -1;      // 当前跟踪的手指 pointer.id
  private downX = 0;
  private downY = 0;
  private curX = 0;
  private curY = 0;
  private readonly maxRadius = 72;   // 拖到这个距离即为满速
  private readonly deadZone = 5;     // 死区：防止手指微抖导致漂移
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};

  dirX = 0;
  dirY = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);

    const kb = scene.input.keyboard;
    if (kb) {
      this.keys = kb.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    }
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.activeId !== -1) return;   // 只跟踪第一根手指
    this.activeId = p.id;
    this.downX = this.curX = p.x;
    this.downY = this.curY = p.y;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.activeId) return;
    this.curX = p.x;
    this.curY = p.y;
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.activeId) return;
    this.activeId = -1;
    this.dirX = 0;
    this.dirY = 0;
  }

  update(): void {
    const k = this.keys;
    // 键盘优先（PC 调试）：方向本身就是单位向量
    const kbActive = !!k && (
      k.A?.isDown || k.D?.isDown || k.W?.isDown || k.S?.isDown ||
      k.LEFT?.isDown || k.RIGHT?.isDown || k.UP?.isDown || k.DOWN?.isDown
    );
    if (kbActive) {
      let kx = 0, ky = 0;
      if (k.A?.isDown || k.LEFT?.isDown) kx -= 1;
      if (k.D?.isDown || k.RIGHT?.isDown) kx += 1;
      if (k.W?.isDown || k.UP?.isDown) ky -= 1;
      if (k.S?.isDown || k.DOWN?.isDown) ky += 1;
      const len = Math.hypot(kx, ky);
      if (len > 0) { this.dirX = kx / len; this.dirY = ky / len; }
      else { this.dirX = 0; this.dirY = 0; }
      return;
    }

    // 触摸拖拽：位移方向即移动方向，拖得越远越快（有上限）
    if (this.activeId === -1) {
      this.dirX = 0;
      this.dirY = 0;
      return;
    }
    const dx = this.curX - this.downX;
    const dy = this.curY - this.downY;
    const len = Math.hypot(dx, dy);
    if (len < this.deadZone) {
      this.dirX = 0;
      this.dirY = 0;
      return;
    }
    const scale = Math.min(1, len / this.maxRadius);
    this.dirX = (dx / len) * scale;
    this.dirY = (dy / len) * scale;
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
    this.scene.input.off('pointerupoutside', this.onUp, this);
  }
}