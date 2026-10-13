// 悬浮菜单 Phaser 层：可拖拽悬浮球 + 全屏面板（见本文件）
// 纯布局/状态逻辑在 floatingMenuCore.ts（可单测）。
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config/balance.ts';
import { sfx } from '../core/audio.ts';
import { vibrate, setVibrate, vibrateEnabled } from '../core/vibration.ts';
import { loadBallState, saveBallState } from './floatState.ts';
import { BALL_RADIUS, DEFAULT_BALL_POS, ROW_H, resolveBallStart, computePanelLayout, type PanelAction, type PanelLayout, type BallPos } from './floatingMenuCore.ts';
// ---------- Phaser 层 ----------

export interface FloatingMenuOptions {
  getPaused: () => boolean;
  setPaused: (v: boolean, showOverlay?: boolean) => void;
  restart: () => void;
  toMenu: () => void;
  /** 场景切换：切到下一张授权背景（面板保持打开，可连续预览） */
  nextBg: () => void;
}

interface ItemView {
  id: PanelAction;
  rect: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
}

export class FloatingMenu {
  private scene: Phaser.Scene;
  private opts: FloatingMenuOptions;
  private layout: PanelLayout;

  private ball: Phaser.GameObjects.Arc;
  private ballIcon: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.Rectangle;
  private card: Phaser.GameObjects.Rectangle;
  private title: Phaser.GameObjects.Text;
  private closeBtn: Phaser.GameObjects.Rectangle;
  private closeText: Phaser.GameObjects.Text;
  private items: ItemView[] = [];

  private open = false;
  private wasPaused = false;
  private dragId = -1;
  private dragOffX = 0;
  private dragOffY = 0;
  private downAt = 0;
  private movedPx = 0;
  private readonly tapSlop = 10;    // 拖动超过 10px 视为拖而非点
  private onSceneDown: (p: Phaser.Input.Pointer) => void = () => {};
  private onSceneMove: (p: Phaser.Input.Pointer) => void = () => {};
  private onSceneUp: (p: Phaser.Input.Pointer) => void = () => {};
  private onFsChange: () => void = () => {};

  constructor(scene: Phaser.Scene, opts: FloatingMenuOptions) {
    this.scene = scene;
    this.opts = opts;
    this.layout = computePanelLayout(GAME_W, GAME_H);

    // 悬浮球（半透明 + 描边 + ☰ 图标），深度最高便于任何画面都能点到
    const start = resolveBallStart(GAME_W, GAME_H, loadBallState(), DEFAULT_BALL_POS, BALL_RADIUS);
    this.ball = scene.add.circle(start.x, start.y, BALL_RADIUS, 0x0d2238, 0.62)
      .setStrokeStyle(2.5, 0x6fc0ff, 0.95)
      .setDepth(190).setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    this.ballIcon = scene.add.text(start.x, start.y, '☰', {
      fontFamily: 'monospace', fontSize: '24px', color: '#dff2ff'
    }).setOrigin(0.5).setDepth(191).setScrollFactor(0);

    // 全屏遮罩 + 居中卡片（默认隐藏）
    this.overlay = scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x03070d, 0.66)
      .setDepth(300).setScrollFactor(0).setVisible(false);
    this.card = scene.add.rectangle(this.layout.cx, this.layout.cy, this.layout.cardW, this.layout.cardH, 0x0f2038, 0.98)
      .setStrokeStyle(3, 0x3d6c9e).setDepth(301).setScrollFactor(0).setVisible(false);
    this.title = scene.add.text(this.layout.cx, this.layout.titleY, '菜单', {
      fontFamily: 'monospace', fontSize: '22px', color: '#eaf6ff'
    }).setOrigin(0.5).setDepth(302).setScrollFactor(0).setVisible(false);

    // 右上关闭钮
    this.closeBtn = scene.add.rectangle(this.layout.closeX, this.layout.closeY, 36, 36, 0x1f3a5f, 1)
      .setStrokeStyle(2, 0x4d7fb5).setDepth(303).setScrollFactor(0).setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.closeText = scene.add.text(this.layout.closeX, this.layout.closeY, '✕', {
      fontFamily: 'monospace', fontSize: '20px', color: '#dff2ff'
    }).setOrigin(0.5).setDepth(304).setScrollFactor(0).setVisible(false);

    // 6 行按钮
    for (const it of this.layout.items) {
      const rect = scene.add.rectangle(it.cx, it.cy, 320, ROW_H, 0x16283f, 1)
        .setStrokeStyle(2, 0x3d6c9e).setDepth(303).setScrollFactor(0).setVisible(false)
        .setInteractive({ useHandCursor: true });
      const text = scene.add.text(it.cx, it.cy, it.label, {
        fontFamily: 'monospace', fontSize: '20px', color: '#e8f4ff'
      }).setOrigin(0.5).setDepth(304).setScrollFactor(0).setVisible(false);
      rect.on('pointerover', () => rect.setFillStyle(0x1f3a5f));
      rect.on('pointerout', () => rect.setFillStyle(0x16283f));
      this.items.push({ id: it.id, rect, text });
    }

    this.wireEvents();
  }

  private wireEvents(): void {
    // 拖动：按下记录偏移，移动更新位置，松开保存（本地坐标为屏幕坐标，Phaser UI 与逻辑分辨率一致）
    this.ball.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.open) { this.close(); return; }     // 面板开着时点球 = 关闭
      if (this.dragId !== -1) return;
      this.dragId = p.id;
      this.dragOffX = this.ball.x - p.x;
      this.dragOffY = this.ball.y - p.y;
      this.downAt = performance.now();
      this.movedPx = 0;
    });

    this.onSceneMove = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.dragId) return;
      const nx = Phaser.Math.Clamp(p.x + this.dragOffX, BALL_RADIUS, GAME_W - BALL_RADIUS);
      const ny = Phaser.Math.Clamp(p.y + this.dragOffY, BALL_RADIUS, GAME_H - BALL_RADIUS);
      this.movedPx += Math.hypot(nx - this.ball.x, ny - this.ball.y);
      this.ball.setPosition(nx, ny);
      this.ballIcon.setPosition(nx, ny);
    };
    this.onSceneUp = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.dragId) return;
      this.dragId = -1;
      if (this.movedPx > this.tapSlop) {
        saveBallState({ x: this.ball.x, y: this.ball.y });   // 拖动结束才保存
        vibrate(12);
      } else {
        this.openPanel();      // 没拖动 = 点按 → 打开面板
      }
    };
    // 面板打开时，点卡片外任意位置 = 关闭
    this.onSceneDown = (p: Phaser.Input.Pointer) => {
      if (!this.open) return;
      const { cx, cy, cardW, cardH } = this.layout;
      const inside = Math.abs(p.x - cx) <= cardW / 2 && Math.abs(p.y - cy) <= cardH / 2;
      if (!inside) this.close();
    };
    this.scene.input.on('pointermove', this.onSceneMove);
    this.scene.input.on('pointerup', this.onSceneUp);
    this.scene.input.on('pointerdown', this.onSceneDown);

    this.closeBtn.on('pointerdown', () => this.close());
    for (const it of this.items) {
      it.rect.on('pointerdown', () => this.act(it.id));
    }

    // 全屏状态变化时同步按钮文案（用户按 Esc 退出全屏也要刷新）
    this.onFsChange = () => this.refreshLabels();
    document.addEventListener('fullscreenchange', this.onFsChange);
    document.addEventListener('webkitfullscreenchange', this.onFsChange);
  }

  private act(id: PanelAction): void {
    switch (id) {
      case 'resume':
        this.close();
        this.opts.setPaused(false);            // 继续游戏
        break;
      case 'bg':
        // 场景切换：面板保持打开，便于连续预览四张背景；同时给出轻震反馈
        this.opts.nextBg();
        vibrate(12);
        this.refreshLabels();
        break;
      case 'sound':
        sfx.setEnabled(!sfx.enabled);
        vibrate(12);
        this.refreshLabels();
        break;
      case 'vib':
        setVibrate(!vibrateEnabled());
        vibrate(12);
        this.refreshLabels();
        break;
      case 'full':
        // 优先走 main.ts 注入的 __FS 统一入口（含 iOS 轻提示与 fullscreenchange 刷新）；
        // 旧浏览器无该钩子时退化走本面板自带逻辑
        this.toggleFullscreen();
        vibrate(12);
        this.refreshLabels();
        break;
      case 'restart':
        this.opts.restart();
        break;
      case 'menu':
        this.opts.toMenu();
        break;
    }
  }

  private refreshLabels(): void {
    const s = this.items.find(i => i.id === 'sound');
    const v = this.items.find(i => i.id === 'vib');
    const f = this.items.find(i => i.id === 'full');
    if (s) s.text.setText(sfx.enabled ? '♪ 音效：开' : '✕ 音效：关');
    if (v) v.text.setText(vibrateEnabled() ? '📳 震动：开' : '✕ 震动：关');
    if (f) f.text.setText(this.isFullscreen() ? '⛶ 退出全屏' : '⛶ 全屏');
  }

  // Fullscreen API（含 webkit 前缀降级）：必须在用户手势内调用。
  // 先用 main.ts 注入的 __FS 统一入口（iOS 轻提示由 main.ts 展示），没有则退化本地实现
  private toggleFullscreen(): void {
    const gfs = (window as unknown as { __FS?: { toggle: () => unknown } }).__FS;
    if (gfs && typeof gfs.toggle === 'function') {
      gfs.toggle();
      return;
    }
    const doc = document as Document & { webkitExitFullscreen?: () => Promise<void>; webkitFullscreenElement?: Element | null };
    const canvas = this.scene.game.canvas as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    if (this.isFullscreen()) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if (doc.webkitExitFullscreen) void doc.webkitExitFullscreen();
    } else if (canvas.requestFullscreen) {
      canvas.requestFullscreen().catch(() => {});
    } else if (canvas.webkitRequestFullscreen) {
      void canvas.webkitRequestFullscreen();
    }
  }

  private isFullscreen(): boolean {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    return !!(document.fullscreenElement || doc.webkitFullscreenElement);
  }

  private openPanel(): void {
    if (this.open) return;
    this.open = true;
    this.wasPaused = this.opts.getPaused();
    // 打开面板 = 暂停游戏，但不显示游戏自带"点击继续"遮罩（本面板即暂停 UI）
    this.opts.setPaused(true, false);
    this.overlay.setVisible(true);
    this.card.setVisible(true);
    this.title.setVisible(true);
    this.closeBtn.setVisible(true);
    this.closeText.setVisible(true);
    for (const it of this.items) {
      it.rect.setVisible(true);
      it.text.setVisible(true);
    }
    this.refreshLabels();
    // 球体变暗一点，避免喧宾夺主
    this.ball.setAlpha(0.5);
    this.ballIcon.setAlpha(0.5);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.overlay.setVisible(false);
    this.card.setVisible(false);
    this.title.setVisible(false);
    this.closeBtn.setVisible(false);
    this.closeText.setVisible(false);
    for (const it of this.items) {
      it.rect.setVisible(false);
      it.text.setVisible(false);
    }
    this.ball.setAlpha(1);
    this.ballIcon.setAlpha(1);
    // 关面板：恢复打开前的暂停态；若此前在跑则继续跑
    this.opts.setPaused(this.wasPaused, true);
  }

  // 供 e2e/调试读取
  get isOpen(): boolean { return this.open; }
  get ballPos(): BallPos { return { x: this.ball.x, y: this.ball.y }; }

  destroy(): void {
    this.scene.input.off('pointermove', this.onSceneMove);
    this.scene.input.off('pointerup', this.onSceneUp);
    this.scene.input.off('pointerdown', this.onSceneDown);
    document.removeEventListener('fullscreenchange', this.onFsChange);
    document.removeEventListener('webkitfullscreenchange', this.onFsChange);
    this.ball.destroy();
    this.ballIcon.destroy();
    this.overlay.destroy();
    this.card.destroy();
    this.title.destroy();
    this.closeBtn.destroy();
    this.closeText.destroy();
    for (const it of this.items) {
      it.rect.destroy();
      it.text.destroy();
    }
    this.items.length = 0;
  }
}
