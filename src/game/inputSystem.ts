// 输入系统：触摸拖拽（全屏任意位置按住拖动）+ 键盘（PC 调试）
// 输出归一化方向向量，与移动逻辑解耦
// v0.2.0 改进：可视化虚拟摇杆 —— 按下时在触摸点画出摇杆底座/摇杆头，松手消失，
// 让手机玩家明确知道"拖哪里、往哪拖"；点击 HUD 按钮等 UI 时不误触摇杆。
import Phaser from 'phaser';
import { computeJoystick, type JoystickResult } from './joystick.ts';

// 供自动化验证与调试读取的摇杆状态（与绘制保持一致）
export interface JoystickViewState {
  active: boolean;
  baseX: number;     // 底座中心 = 触摸按下点
  baseY: number;
  knobX: number;     // 摇杆头（已按半径钳制）
  knobY: number;
  magnitude: number; // 满速系数 0..1
  dirX: number;      // 方向向量（含幅度，长度 0..1）
  dirY: number;
}

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
  private joystickGfx: Phaser.GameObjects.Graphics;
  private joy: JoystickResult = { dirX: 0, dirY: 0, magnitude: 0, knobX: 0, knobY: 0 };

  dirX = 0;
  dirY = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);

    // 摇杆是屏幕空间 UI：不受相机滚动影响
    this.joystickGfx = scene.add.graphics().setDepth(90).setScrollFactor(0);

    const kb = scene.input.keyboard;
    if (kb) {
      this.keys = kb.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    }
  }

  // 按下的位置是否落在可见的 UI 对象上（音效按钮、升级卡片等）
  // 命中这些时不启动摇杆，避免点按钮误触发移动
  private isTouchingUI(p: Phaser.Input.Pointer): boolean {
    const hits = this.scene.input.hitTestPointer(p);
    for (let i = 0; i < hits.length; i++) {
      const o = hits[i] as { visible?: boolean } | null;
      if (o?.visible) return true;
    }
    return false;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.activeId !== -1) return;   // 只跟踪第一根手指
    if (this.isTouchingUI(p)) return;   // 点按钮/卡片不触发摇杆
    this.activeId = p.id;
    this.downX = this.curX = p.x;
    this.downY = this.curY = p.y;
    this.recompute();
    this.drawJoystick();
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.activeId) return;
    this.curX = p.x;
    this.curY = p.y;
    this.recompute();
    this.drawJoystick();
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.activeId) return;
    this.reset();
  }

  // 用纯函数统一换算方向/幅度/摇杆头位置（与 joystick.ts 单测同一套逻辑）
  private recompute(): void {
    this.joy = computeJoystick(this.downX, this.downY, this.curX, this.curY, this.maxRadius, this.deadZone);
  }

  // 底座 + 摇杆头，方向直观可见
  private drawJoystick(): void {
    const g = this.joystickGfx;
    g.clear();
    if (this.activeId === -1) return;

    // 底座
    g.fillStyle(0x7fc8ff, 0.14);
    g.fillCircle(this.downX, this.downY, this.maxRadius);
    g.lineStyle(2, 0x7fc8ff, 0.45);
    g.strokeCircle(this.downX, this.downY, this.maxRadius);

    // 摇杆头：按半径钳制，方向一眼可见
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(this.joy.knobX, this.joy.knobY, 28);
    g.fillStyle(0x2f7fd0, 0.9);
    g.fillCircle(this.joy.knobX, this.joy.knobY, 20);
    g.fillStyle(0xd6f0ff, 0.95);
    g.fillCircle(this.joy.knobX, this.joy.knobY, 8);
  }

  // 重置所有触摸状态（升级面板弹出时调用，清掉残留摇杆；松手时也走这里）
  reset(): void {
    this.activeId = -1;
    this.curX = this.downX;
    this.curY = this.downY;
    this.dirX = 0;
    this.dirY = 0;
    this.recompute();
    this.drawJoystick();
  }

  // 供自动化验证读取的当前摇杆状态；未在拖动时为 null
  get joystick(): JoystickViewState | null {
    if (this.activeId === -1) return null;
    return {
      active: true,
      baseX: this.downX, baseY: this.downY,
      knobX: this.joy.knobX, knobY: this.joy.knobY,
      magnitude: this.joy.magnitude,
      dirX: this.joy.dirX, dirY: this.joy.dirY
    };
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

    // 触摸拖拽：方向即位移方向，拖得越远越快（有上限）
    this.dirX = this.joy.dirX;
    this.dirY = this.joy.dirY;
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
    this.scene.input.off('pointerupoutside', this.onUp, this);
    this.joystickGfx.destroy();
  }
}
