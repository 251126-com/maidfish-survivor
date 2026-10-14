// v0.16.0 统一 UI 玻璃风格（粉蓝治愈系）：圆角、半透明、描边高光、可选外发光。
// v0.16.0 配色向选定大厅概念图靠拢：粉(0xff9fd8) + 蓝(0x7fd4ff) 治愈风；
// 玻璃底色为偏粉的深紫蓝(0x2a2340)，保证在明亮粉蓝背景上有对比度、文字可读。
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
  const fill = s.fill ?? 0x2a2340;
  const fillAlpha = s.fillAlpha ?? 0.72;
  const stroke = s.stroke ?? 0xff9fd8;
  const strokeAlpha = s.strokeAlpha ?? 0.9;
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
  g.lineStyle(Math.max(1, sw * 0.7), 0xffffff, 0.22);
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

  // v0.16.0 微交互：按下有缩放反馈 + 水波涟漪扩散（数量克制，最多 3 个并存）
  let hovering = false;
  const pressTo = (to: number) => {
    for (const t of hoverTweens) t.stop();
    hoverTweens.length = 0;
    hoverTweens.push(scene.tweens.add({ targets: c, scaleX: to, scaleY: to, duration: 100, ease: 'Sine.easeOut' }));
  };
  c.on('pointerover', () => { hovering = true; });
  c.on('pointerout', () => { hovering = false; });
  c.on('pointerdown', () => {
    pressTo(0.95);
    glassRipple(scene, x, y, 0x9fe8ff, 1.5);
    if (onTap) onTap();
  });
  c.on('pointerup', () => pressTo(hovering ? 1.04 : 1));

  return {
    c, g, text,
    setLabel: (t: string) => text.setText(t),
    setHover
  };
}


// ===================== v0.16.0 水波涟漪反馈 =====================
// 环形涟漪：预生成柔环纹理 → 单个 image 放大+淡出，按场景级计数控制并发（≤3）。
let ringTexReady = false;
function ensureRingTexture(scene: Phaser.Scene): void {
  if (ringTexReady || scene.textures.exists('glass_ring')) { ringTexReady = true; return; }
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(64, 64, 42, 0, Math.PI * 2); ctx.stroke();
  scene.textures.addCanvas('glass_ring', c);
  ringTexReady = true;
}

/** 在 (x,y) 生成一圈扩散涟漪（web 端可 tint 上色；canvas 兜底为白环）。并发 ≤3。 */
export function glassRipple(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color = 0x9fe8ff,
  maxScale = 1.5
): void {
  ensureRingTexture(scene);
  if (!scene.textures.exists('glass_ring')) return;
  const n = (scene.data.get('glassRipples') as number) ?? 0;
  if (n >= 3) return;
  scene.data.set('glassRipples', n + 1);
  const ring = scene.add.image(x, y, 'glass_ring').setScale(0.45).setAlpha(0.85).setDepth(500);
  ring.setBlendMode(Phaser.BlendModes.ADD);
  try { ring.setTint(color); } catch { /* canvas 兜底 */ }
  scene.tweens.add({
    targets: ring, scaleX: maxScale, scaleY: maxScale, alpha: 0,
    duration: 480, ease: 'Cubic.easeOut',
    onComplete: () => {
      ring.destroy();
      scene.data.set('glassRipples', ((scene.data.get('glassRipples') as number) ?? 1) - 1);
    }
  });
}
