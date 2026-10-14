// v0.15.0 统一 UI 玻璃风格：圆角、半透明、描边高光、可选外发光。
// 所有组件以 Container 承载（缩放锚点在容器原点），hover 用容器缩放做轻反馈。
// 大厅、商店弹窗、背景弹窗、悬浮菜单共用此风格，保证全局 UI 统一。
import Phaser from 'phaser';

export interface GlassStyle {
  radius?: number;
  fill?: number;
  fillAlpha?: number;
  stroke?: number;
  strokeAlpha?: number;
  strokeWidth?: number;
  glow?: number;        // 外发光色（0 = 无）
  glowAlpha?: number;
  depth?: number;
}

/** 绘制一张居中圆角玻璃面板（容器内局部坐标 0,0 = 中心） */
export function drawGlass(
  scene: Phaser.Scene,
  w: number,
  h: number,
  s: GlassStyle = {}
): Phaser.GameObjects.Graphics {
  const r = s.radius ?? 18;
  const g = scene.add.graphics();
  const fill = s.fill ?? 0x12283f;
  const fillAlpha = s.fillAlpha ?? 0.62;
  const stroke = s.stroke ?? 0x4d8fd8;
  const strokeAlpha = s.strokeAlpha ?? 0.85;
  const sw = s.strokeWidth ?? 2.5;

  g.fillStyle(fill, fillAlpha);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, r);

  // 外发光（多层描边模拟柔光）
  if (s.glow) {
    const ga = s.glowAlpha ?? 0.20;
    for (let i = 1; i <= 3; i++) {
      g.lineStyle(sw + i * 3, s.glow, ga / i);
      g.strokeRoundedRect(-w / 2 - i * 2, -h / 2 - i * 2, w + i * 4, h + i * 4, r + i * 2);
    }
  }

  g.lineStyle(sw, stroke, strokeAlpha);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

  // 顶部高光（玻璃反光）：一条内边缘亮线
  g.lineStyle(Math.max(1, sw * 0.7), 0xffffff, 0.16);
  g.beginPath();
  g.moveTo(-w / 2 + r, -h / 2 + 2);
  g.lineTo(w / 2 - r, -h / 2 + 2);
  g.strokePath();

  if (s.depth) g.setDepth(s.depth);
  return g;
}

export interface GlassButton {
  c: Phaser.GameObjects.Container;
  g: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  setLabel: (t: string) => void;
  setHover: (on: boolean) => void;
}

/** 玻璃按钮：圆角半透明 + 描边 + 可选发光 + hover 轻缩放反馈 + 点击回调 */
export function glassButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  opts: GlassStyle & { fontSize?: number; color?: string } = {},
  onTap?: () => void
): GlassButton {
  const c = scene.add.container(x, y);
  const g = drawGlass(scene, w, h, opts);
  c.add(g);
  const text = scene.add.text(0, 0, label, {
    fontFamily: 'monospace',
    fontSize: `${opts.fontSize ?? 19}px`,
    color: opts.color ?? '#eaf6ff'
  }).setOrigin(0.5);
  c.add(text);
  c.setDepth(opts.depth ?? 0);
  c.setSize(w, h);
  c.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
  if (onTap) c.on('pointerdown', onTap);

  const hoverTweens: Phaser.Tweens.Tween[] = [];
  const setHover = (on: boolean) => {
    for (const t of hoverTweens) t.stop();
    hoverTweens.length = 0;
    hoverTweens.push(scene.tweens.add({
      targets: c,
      scaleX: on ? 1.04 : 1,
      scaleY: on ? 1.04 : 1,
      duration: 130,
      ease: 'Sine.easeOut'
    }));
  };
  c.on('pointerover', () => setHover(true));
  c.on('pointerout', () => setHover(false));

  return {
    c, g, text,
    setLabel: (t: string) => text.setText(t),
    setHover
  };
}
