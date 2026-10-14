// 主菜单（v0.16.2 参考图排版重做）：背景 = 用户最终参考图(新 lobby_bg) + 环境动画层
// （气泡 / 光斑光柱 / 水面轻微折射 / 指针视差），不再代码绘制鲸鱼娘/金鱼等额外人物或小鱼。
// 排版严格按参考图：左侧纵向「皮肤/永久强化/背景/设置」、左下「开始游戏」、
// 右上独立金币玻璃胶囊、左上标题；皮肤/强化/背景/设置均为玻璃弹窗/按钮接入现有能力。
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config/balance.ts';
import { BG_ORDER, randomStartIndex } from '../config/background.ts';
import { META_TREE } from '../config/upgrades.ts';
import { DEFAULT_SKIN, SKIN_BOWL, SKIN_MAID, SKINS, isSkinId, type SkinId } from '../config/characters.ts';
import { loadSave, writeSave, setSkin } from '../core/save.ts';
import { VERSION } from '../config/version.ts';
import { glassButton, drawGlass, type GlassButton } from '../ui/glassUI.ts';
import { sfx } from '../core/audio.ts';
import { vibrate, vibrateEnabled, setVibrate } from '../core/vibration.ts';
import { buildLobbyLayout } from './lobbyLayout.ts';

// 购买/换肤后 scene.restart() 会重建实例，模块级变量跨实例保留用户选中的起始背景
let lastBgPick: number | null = null;

export class MenuScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;
  private goldCapsule: Phaser.GameObjects.Container | null = null;
  private hintText: Phaser.GameObjects.Text | null = null;
  /** 当前选择的起始背景下标（0..3），默认随机；重载后沿用上次选择 */
  private bgPick = lastBgPick ?? randomStartIndex();
  /** 当前皮肤（女仆装默认/饭盆头可切换，战斗内生效；大厅人物为底图内绘制不再叠加立绘） */
  private skin: SkinId = DEFAULT_SKIN;
  private skinBtn: GlassButton | null = null;

  // 环境动画层（视差容器）：光柱/光斑/折射入 envC，气泡入 bubbleC
  private envC: Phaser.GameObjects.Container | null = null;
  private bubbleC: Phaser.GameObjects.Container | null = null;
  private bubbles: Phaser.GameObjects.Arc[] = [];
  private rayG: Phaser.GameObjects.Graphics[] = [];
  private causticG: Phaser.GameObjects.Graphics | null = null;
  private streaks: Phaser.GameObjects.Image[] = [];

  // 弹窗（默认隐藏，按钮唤起）
  private shopC: Phaser.GameObjects.Container | null = null;
  private bgC: Phaser.GameObjects.Container | null = null;
  private settingsC: Phaser.GameObjects.Container | null = null;

  constructor() { super('Menu'); }

  create(): void {
    const layout = buildLobbyLayout();
    const save = loadSave();
    this.skin = isSkinId(save.skin) ? save.skin : DEFAULT_SKIN;

    // ============ 背景 = 新参考图底图 + 环境动画层 ============
    this.buildWaterBase();
    this.buildLightRays();
    this.buildBubbles();
    this.buildRefraction();

    // ============ 左上标题（小号，不压人物构图） ============
    this.add.text(layout.title.x, layout.title.y, '深海鲸语', {
      fontFamily: 'monospace', fontSize: '34px', color: '#9fe0ff',
      stroke: '#04304f', strokeThickness: 6
    }).setOrigin(0, 0.5).setDepth(layout.depth.ui).setShadow(0, 0, '#3f9fe8', 4, true, true);
    this.add.text(layout.sub.x, layout.sub.y, '自动射击 · 走位生存 · 12 分钟撑到底', {
      fontFamily: 'monospace', fontSize: '14px', color: '#a8c8e8'
    }).setOrigin(0, 0.5).setDepth(layout.depth.ui);
    const mm = Math.floor(save.best.time / 60);
    const ss = Math.floor(save.best.time % 60);
    this.add.text(layout.best.x, layout.best.y, `最佳：${mm}分${ss}秒 · 击杀 ${save.best.kills} · 最高 Lv.${save.best.level}`, {
      fontFamily: 'monospace', fontSize: '12px', color: '#d8ecff'
    }).setOrigin(0, 0.5).setDepth(layout.depth.ui).setAlpha(0.9);

    // ============ 右上独立金币胶囊 ============
    this.buildGoldCapsule(layout, save.gold);

    // ============ 左侧纵向四入口：皮肤/永久强化/背景/设置 ============
    this.skinBtn = glassButton(this, layout.nav[0].cx, layout.nav[0].cy, layout.nav[0].w, layout.nav[0].h,
      this.skinLabel(), {
        fill: 0x2a2340, fillAlpha: 0.72, stroke: 0x7fd4ff, strokeWidth: 2,
        glow: 0x3f9fe8, glowAlpha: 0.16, radius: 22, depth: layout.depth.ui, fontSize: 18
      }, () => this.handleSkinClick());
    glassButton(this, layout.nav[1].cx, layout.nav[1].cy, layout.nav[1].w, layout.nav[1].h,
      '⚡  永久强化', {
        fill: 0x2a2340, fillAlpha: 0.72, stroke: 0x7fd4ff, strokeWidth: 2,
        glow: 0x3f9fe8, glowAlpha: 0.16, radius: 22, depth: layout.depth.ui, fontSize: 18
      }, () => this.openShop());
    glassButton(this, layout.nav[2].cx, layout.nav[2].cy, layout.nav[2].w, layout.nav[2].h,
      '🌌  背景选择', {
        fill: 0x2a2340, fillAlpha: 0.72, stroke: 0x7fd4ff, strokeWidth: 2,
        glow: 0x3f9fe8, glowAlpha: 0.16, radius: 22, depth: layout.depth.ui, fontSize: 18
      }, () => this.openBg());
    glassButton(this, layout.nav[3].cx, layout.nav[3].cy, layout.nav[3].w, layout.nav[3].h,
      '⚙  设置', {
        fill: 0x2a2340, fillAlpha: 0.72, stroke: 0x7fd4ff, strokeWidth: 2,
        glow: 0x3f9fe8, glowAlpha: 0.16, radius: 22, depth: layout.depth.ui, fontSize: 18
      }, () => this.openSettings());

    // ============ 左下「开始游戏」（视觉焦点，发光大按钮） ============
    glassButton(this, layout.start.cx, layout.start.cy, layout.start.w, layout.start.h, '▶  开始游戏', {
      fill: 0x1e5fae, fillAlpha: 0.92, stroke: 0x7fd4ff, strokeWidth: 4,
      glow: 0x3f9fe8, glowAlpha: 0.5, radius: 30, depth: layout.depth.ui,
      fontSize: 26, color: '#ffffff'
    }, () => this.scene.start('Game', { bgStart: this.bgPick }));
    // CTA 常驻呼吸光晕（柔光层动画，克制开销：只动 1 个 graphics 的 alpha）
    const pulse = this.add.graphics().setDepth(layout.depth.ui - 0.5);
    this.tweens.add({
      targets: pulse, alpha: 0.25, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
    const drawPulse = () => {
      pulse.clear();
      pulse.fillStyle(0x3f9fe8, 0.22);
      pulse.fillRoundedRect(layout.start.cx - layout.start.w / 2 - 12, layout.start.cy - layout.start.h / 2 - 14,
        layout.start.w + 24, layout.start.h + 28, 34);
    };
    drawPulse();
    this.time.addEvent({ delay: 2000, loop: true, callback: drawPulse });

    // ============ 底部版本角标 ============
    this.add.text(layout.version.x, layout.version.y, `触摸拖动 / WASD 移动 · 自动开火 · v${VERSION}`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#6f93b3'
    }).setOrigin(0.5).setDepth(layout.depth.ui);

    // 弹窗（商店/背景/设置）——先构建后默认隐藏
    this.buildShopModal();
    this.buildBgModal();
    this.buildSettingsModal();

    // 自动化钩子（e2e/调试）
    (window as unknown as { __MENU_BG?: { get: () => number; set: (i: number) => void; count: number } }).__MENU_BG = {
      get: () => this.bgPick,
      set: (i: number) => this.pickBg(i),
      count: BG_ORDER.length
    };
    (window as unknown as {
      __MENU_CHAR?: {
        state: () => { charId: string; skin: string; unlocked: string[]; gold: number };
        toggleSkin: () => void;
      }
    }).__MENU_CHAR = {
      state: () => {
        const s = loadSave();
        return { charId: 'whale', skin: s.skin, unlocked: ['whale'], gold: s.gold };
      },
      toggleSkin: () => this.handleSkinClick()
    };
    // v0.16.2 大厅排版钩子：供 e2e 断言矩形不重叠/不溢出
    (window as unknown as {
      __LOBBY_LAYOUT?: {
        version: string;
        GAME_W: number;
        GAME_H: number;
        nav: Array<{ id: string; cx: number; cy: number; w: number; h: number }>;
        start: { cx: number; cy: number; w: number; h: number };
        gold: { cx: number; cy: number; w: number; h: number };
      }
    }).__LOBBY_LAYOUT = {
      version: VERSION,
      GAME_W,
      GAME_H,
      nav: layout.nav.map(n => ({ id: n.id, cx: n.cx, cy: n.cy, w: n.w, h: n.h })),
      start: layout.start,
      gold: layout.gold
    };
  }

  // ---- 每帧：环境层指针视差（背景不动，光柱/光斑/折射/气泡按不同系数平移 = 视差深度感） ----
  private seaT = 0;
  update(_t: number, delta: number): void {
    this.seaT += delta / 1000;
    const p = this.input.activePointer;
    if (p) {
      const px = (p.x / GAME_W - 0.5) * 2;   // -1..1
      const py = (p.y / GAME_H - 0.5) * 2;
      // 距离越远（视差越大）越"靠近镜头"：气泡(±22) > 环境层(±14)
      this.envC?.setPosition(px * 14, py * 6);
      this.bubbleC?.setPosition(px * 22, py * 10);
    }
  }

  // ---- 水面基底：新参考图底图（人物构图原样保留）+ 轻暗化保证玻璃 UI/文字可读 ----
  private buildWaterBase(): void {
    if (this.textures.exists('lobby_bg')) {
      this.add.image(0, 0, 'lobby_bg').setOrigin(0, 0).setDepth(0);
      // 轻暗化保证玻璃 UI/文字可读（参考图偏亮）
      this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x081a30, 0.22).setDepth(0.05);
      return;
    }
    if (!this.textures.exists('lobby_grad')) {
      const c = document.createElement('canvas');
      c.width = GAME_W; c.height = GAME_H;
      const ctx = c.getContext('2d')!;
      const grad = ctx.createLinearGradient(0, 0, 0, GAME_H);
      grad.addColorStop(0, '#0e2547');
      grad.addColorStop(0.5, '#0a1d38');
      grad.addColorStop(1, '#050f1e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, GAME_W, GAME_H);
      this.textures.addCanvas('lobby_grad', c);
    }
    this.add.image(0, 0, 'lobby_grad').setOrigin(0, 0).setDepth(0);
  }

  // ---- 顶部斜射光柱 + 缓缓飘动的光斑（克制：3 根光柱 + 3 团光斑，入 envC 视差层） ----
  private buildLightRays(): void {
    const env = this.add.container(0, 0).setDepth(1);
    this.envC = env;
    const rays = [
      { x: 180, w: 90, a: 0.05 },
      { x: 620, w: 130, a: 0.07 },
      { x: 1030, w: 100, a: 0.05 }
    ];
    for (const r of rays) {
      const g = this.add.graphics();
      g.fillStyle(0xbfe8ff, r.a);
      g.beginPath();
      g.moveTo(r.x - r.w / 2, -10);
      g.lineTo(r.x + r.w / 2, -10);
      g.lineTo(r.x + r.w, GAME_H);
      g.lineTo(r.x - r.w, GAME_H);
      g.closePath();
      g.fillPath();
      env.add(g);
      this.rayG.push(g);
      this.tweens.add({
        targets: g, alpha: 0.35, duration: 2400 + Math.random() * 1200,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });
    }
    // 顶部水面光斑（柔光椭圆，缓慢游移 = 水面光斑动态）
    this.causticG = this.add.graphics();
    env.add(this.causticG);
    this.tweens.add({
      targets: this.causticG, alpha: 0.3, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
    this.time.addEvent({
      delay: 220, loop: true,
      callback: () => {
        const g = this.causticG;
        if (!g) return;
        g.clear();
        g.fillStyle(0x8fd4ff, 0.16);
        g.fillEllipse(280 + this.seaT * 12, 66 + Math.sin(this.seaT * 0.9) * 22, 210, 60);
        g.fillEllipse(740 + this.seaT * 9, 52 + Math.sin(this.seaT * 1.2) * 30, 260, 70);
        g.fillEllipse(1120 + this.seaT * 7, 84 + Math.sin(this.seaT * 0.7) * 26, 190, 54);
      }
    });
  }

  // ---- 上升气泡（12 颗，循环上飘；入 bubbleC 视差层；克制开销） ----
  private buildBubbles(): void {
    const bc = this.add.container(0, 0).setDepth(2.5);
    this.bubbleC = bc;
    for (let i = 0; i < 12; i++) {
      const x = 90 + Math.random() * (GAME_W - 180);
      const y = GAME_H - 30 - Math.random() * 120;
      const r = 2.5 + Math.random() * 3.5;
      const b = this.add.circle(x, y, r, 0xbfe8ff, 0.45);
      bc.add(b);
      this.bubbles.push(b);
      const dur = 3200 + Math.random() * 3200;
      const baseY = y;
      this.tweens.add({
        targets: b, y: -30, alpha: 0,
        duration: dur, delay: i * 280, repeat: -1,
        ease: 'Sine.easeIn',
        onRepeat: () => { b.setAlpha(0.45); b.x = 90 + Math.random() * (GAME_W - 180); b.y = baseY; }
      });
    }
  }

  // ---- 水面轻微折射：前玻璃柔光条缓慢漂移（克制 3 条，入 envC 视差层） ----
  private buildRefraction(): void {
    if (!this.textures.exists('glass_streak')) {
      const c = document.createElement('canvas');
      c.width = 420; c.height = 60;
      const ctx = c.getContext('2d')!;
      const hg = ctx.createLinearGradient(0, 30, 420, 30);
      hg.addColorStop(0, 'rgba(255,255,255,0)');
      hg.addColorStop(0.5, 'rgba(159,232,255,0.28)');
      hg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(0, 0, 420, 60);
      const vg = ctx.createLinearGradient(0, 0, 0, 60);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(0.5, 'rgba(0,0,0,1)');
      vg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, 420, 60);
      this.textures.addCanvas('glass_streak', c);
    }
    const lanes = [
      { y: 180, x0: -240, x1: 1480, dur: 9000, alpha: 0.5, angle: -0.06, delay: 0 },
      { y: 470, x0: -200, x1: 1500, dur: 11500, alpha: 0.42, angle: 0.05, delay: 3000 },
      { y: 640, x0: -180, x1: 1520, dur: 10200, alpha: 0.34, angle: -0.03, delay: 6000 }
    ];
    const env = this.envC!;
    for (const l of lanes) {
      const img = this.add.image(l.x0, l.y, 'glass_streak').setAlpha(0).setRotation(l.angle);
      env.add(img);
      this.streaks.push(img);
      this.tweens.add({
        targets: img, x: l.x1, alpha: l.alpha,
        duration: l.dur, delay: l.delay, repeat: -1,
        ease: 'Sine.easeInOut',
        onRepeat: () => { img.x = l.x0; img.setAlpha(0); }
      });
    }
  }

  // ---- 右上独立金币玻璃胶囊（含金币图标 + 数字，购买后实时更新） ----
  private buildGoldCapsule(layout: ReturnType<typeof buildLobbyLayout>, gold: number): void {
    const c = this.add.container(layout.gold.cx, layout.gold.cy).setDepth(layout.depth.ui);
    const g = drawGlass(this, layout.gold.w, layout.gold.h, {
      radius: 26, fill: 0x2a2340, fillAlpha: 0.78, stroke: 0xffd447, strokeAlpha: 0.9,
      strokeWidth: 2, glow: 0xffd447, glowAlpha: 0.14
    });
    c.add(g);
    // 金币图标（金色小圆 + 高光）
    const coin = this.add.circle(-layout.gold.w / 2 + 34, 0, 13, 0xffd447, 1);
    c.add(coin);
    const coinHi = this.add.circle(-layout.gold.w / 2 + 31, -4, 4, 0xfff6d8, 0.95);
    c.add(coinHi);
    this.goldText = this.add.text(-layout.gold.w / 2 + 56, 0, `金币 ${gold}`, {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffd447',
      stroke: '#4a3000', strokeThickness: 4
    }).setOrigin(0, 0.5);
    c.add(this.goldText);
    this.goldCapsule = c;
  }

  private setGold(gold: number): void {
    if (this.goldText) this.goldText.setText(`金币 ${gold}`);
  }

  // ============ 功能入口 ============

  private skinLabel(): string {
    const s = this.skin === SKIN_BOWL ? SKINS[SKIN_BOWL].name : SKINS[SKIN_MAID].name;
    return `👗  皮肤：${s}`;
  }

  /** 皮肤切换：女仆装(默认) <-> 饭盆头(搞笑)，纯外观即写档。
   *  大厅人物为底图内绘制（参考图构图不变），皮肤在战斗内生效。 */
  private handleSkinClick(): void {
    const s = loadSave();
    const ns: SkinId = this.skin === SKIN_MAID ? SKIN_BOWL : SKIN_MAID;
    setSkin(s, ns);
    writeSave(s);
    this.skin = ns;
    this.skinBtn?.setLabel(this.skinLabel());
    this.showHint(ns === SKIN_MAID ? '皮肤 → 女仆装（战斗内生效）' : '皮肤 → 饭盆头（战斗内生效）');
  }

  // ---- 永久强化商店（玻璃弹窗） ----
  private openShop(): void {
    if (!this.shopC) return;
    this.shopC.setVisible(true);
    this.shopC.setDepth(100);
  }
  private closeShop(): void {
    this.shopC?.setVisible(false);
  }

  private buildShopModal(): Phaser.GameObjects.Container {
    const w = 980;
    const h = 500;
    const c = this.add.container(GAME_W / 2, GAME_H / 2).setDepth(100).setVisible(false);
    const overlay = this.add.rectangle(0, 0, GAME_W + 40, GAME_H + 40, 0x03070d, 0.72).setInteractive();
    c.add(overlay);
    const card = drawGlass(this, w, h, {
      radius: 28, fill: 0x0e2136, fillAlpha: 0.94, stroke: 0x4d8fd8, strokeAlpha: 0.9,
      strokeWidth: 3, glow: 0x2f7fd0, glowAlpha: 0.18
    });
    card.setDepth(101);
    c.add(card);
    c.add(this.add.text(0, -h / 2 + 36, '永久强化（金币保留，越打越强）', {
      fontFamily: 'monospace', fontSize: '20px', color: '#cfeaff'
    }).setOrigin(0.5).setDepth(102));
    const close = drawGlass(this, 40, 40, {
      radius: 14, fill: 0x1f3a5f, fillAlpha: 0.95, stroke: 0x4d7fb5
    }).setPosition(w / 2 - 34, -h / 2 + 34)
      .setInteractive(new Phaser.Geom.Rectangle(-20, -20, 40, 40), Phaser.Geom.Rectangle.Contains);
    close.on('pointerdown', () => this.closeShop());
    c.add(close);
    c.add(this.add.text(w / 2 - 34, -h / 2 + 34, '✕', {
      fontFamily: 'monospace', fontSize: '18px', color: '#dff2ff'
    }).setOrigin(0.5).setDepth(103));

    const cols = 3;
    const cardW = 280;
    const cardH = 96;
    const gapX = 30;
    const gapY = 24;
    const totalW = cardW * cols + gapX * (cols - 1);
    const startX = -totalW / 2 + cardW / 2;
    const startY = -h / 2 + 96;
    this.buildShopCards(c, cols, cardW, cardH, gapX, gapY, startX, startY);
    c.add(this.add.text(0, h / 2 - 26, '金币永久保留 · 强化效果跨局叠加 · 点击卡片购买', {
      fontFamily: 'monospace', fontSize: '13px', color: '#54708c'
    }).setOrigin(0.5).setDepth(102));
    this.shopC = c;
    return c;
  }

  private buildShopCards(
    c: Phaser.GameObjects.Container,
    cols: number, cardW: number, cardH: number, gapX: number, gapY: number,
    startX: number, startY: number
  ): void {
    const save = loadSave();
    const gold = save.gold;
    META_TREE.forEach((m, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cardW + gapX);
      const cy = startY + row * (cardH + gapY);
      const rank = save.meta[m.id] ?? 0;
      const maxed = rank >= m.maxRank;
      const cost = m.cost(rank);
      const card = drawGlass(this, cardW, cardH, {
        radius: 16, fill: 0x142a44, fillAlpha: 0.72,
        stroke: maxed ? 0x4de8c2 : 0x3d6c9e, strokeAlpha: 0.8, strokeWidth: 2
      }).setPosition(cx, cy);
      c.add(card);
      c.add(this.add.text(cx - cardW / 2 + 14, cy - cardH / 2 + 18, `${m.name}  Lv.${rank}/${m.maxRank}`, {
        fontFamily: 'monospace', fontSize: '17px', color: '#eaf6ff'
      }).setDepth(102));
      c.add(this.add.text(cx - cardW / 2 + 14, cy - cardH / 2 + 50, m.desc, {
        fontFamily: 'monospace', fontSize: '12px', color: '#8fb8d8'
      }).setDepth(102));
      const priceLabel = maxed ? '已满级' : `${cost} 金币`;
      c.add(this.add.text(cx + cardW / 2 - 14, cy + cardH / 2 - 26, priceLabel, {
        fontFamily: 'monospace', fontSize: '15px',
        color: maxed ? '#4de8c2' : (gold >= cost ? '#ffd447' : '#7a8a9a')
      }).setOrigin(1, 0.5).setDepth(102));

      if (!maxed) {
        card.setInteractive(new Phaser.Geom.Rectangle(-cardW / 2, -cardH / 2, cardW, cardH), Phaser.Geom.Rectangle.Contains);
        card.on('pointerdown', () => {
          const s = loadSave();
          const r = s.meta[m.id] ?? 0;
          if (r >= m.maxRank) return;
          const cst = m.cost(r);
          if (s.gold < cst) { this.flashGold(); return; }
          s.gold -= cst;
          s.meta[m.id] = r + 1;
          writeSave(s);
          this.setGold(s.gold);
          this.rebuildShopModal();
          this.showHint(`${m.name} → Lv.${r + 1}`);
        });
      }
    });
  }

  private rebuildShopModal(): void {
    this.shopC?.destroy(true);
    this.shopC = null;
    const c = this.buildShopModal();
    c.setVisible(true);
  }

  // ---- 背景选择（玻璃弹窗） ----
  private openBg(): void {
    if (!this.bgC) return;
    this.bgC.setVisible(true);
    this.bgC.setDepth(100);
  }
  private closeBg(): void {
    this.bgC?.setVisible(false);
  }

  private buildBgModal(): void {
    const w = 920;
    const h = 300;
    const c = this.add.container(GAME_W / 2, GAME_H / 2).setDepth(100).setVisible(false);
    const overlay = this.add.rectangle(0, 0, GAME_W + 40, GAME_H + 40, 0x03070d, 0.72).setInteractive();
    c.add(overlay);
    const card = drawGlass(this, w, h, {
      radius: 28, fill: 0x0e2136, fillAlpha: 0.94, stroke: 0x4d8fd8, strokeAlpha: 0.9,
      strokeWidth: 3, glow: 0x2f7fd0, glowAlpha: 0.18
    });
    c.add(card);
    c.add(this.add.text(0, -h / 2 + 34, '起始场景（局内每 60 秒自动轮换）', {
      fontFamily: 'monospace', fontSize: '19px', color: '#cfeaff'
    }).setOrigin(0.5).setDepth(102));
    const close = drawGlass(this, 40, 40, {
      radius: 14, fill: 0x1f3a5f, fillAlpha: 0.95, stroke: 0x4d7fb5
    }).setPosition(w / 2 - 34, -h / 2 + 34)
      .setInteractive(new Phaser.Geom.Rectangle(-20, -20, 40, 40), Phaser.Geom.Rectangle.Contains);
    close.on('pointerdown', () => this.closeBg());
    c.add(close);
    c.add(this.add.text(w / 2 - 34, -h / 2 + 34, '✕', {
      fontFamily: 'monospace', fontSize: '18px', color: '#dff2ff'
    }).setOrigin(0.5).setDepth(103));

    const n = BG_ORDER.length;
    const cardW = 190;
    const cardH = 120;
    const gap = 24;
    const totalW = cardW * n + gap * (n - 1);
    const startX = -totalW / 2 + cardW / 2;
    BG_ORDER.forEach((phase, i) => {
      const cx = startX + i * (cardW + gap);
      const sel = i === this.bgPick;
      const bgCard = drawGlass(this, cardW, cardH, {
        radius: 16, fill: sel ? 0x2f7fd0 : 0x142a44, fillAlpha: sel ? 0.9 : 0.6,
        stroke: sel ? 0x9fe8ff : 0x3d6c9e, strokeAlpha: 0.85, strokeWidth: sel ? 3 : 2,
        glow: sel ? 0x3f9fe8 : 0, glowAlpha: 0.3
      }).setPosition(cx, 26);
      c.add(bgCard);
      c.add(this.add.text(cx, 26, phase.name, {
        fontFamily: 'monospace', fontSize: '17px',
        color: sel ? '#ffffff' : '#bcd8f0'
      }).setOrigin(0.5).setDepth(102));
      c.add(this.add.text(cx, 60, sel ? '✓ 起始场景' : '点击选择', {
        fontFamily: 'monospace', fontSize: '12px',
        color: sel ? '#4de8c2' : '#7aa7c8'
      }).setOrigin(0.5).setDepth(102));
      bgCard.setInteractive(new Phaser.Geom.Rectangle(-cardW / 2, -cardH / 2, cardW, cardH), Phaser.Geom.Rectangle.Contains);
      bgCard.on('pointerdown', () => {
        this.pickBg(i);
        this.closeBg();
        this.showHint(`起始场景 → ${phase.name}`);
      });
    });
    this.bgC = c;
  }

  private pickBg(i: number): void {
    if (i < 0 || i >= BG_ORDER.length) return;
    this.bgPick = i;
    lastBgPick = i;   // 重载后沿用用户选择
  }

  // ---- 设置弹窗：真实接入音效(sfx.setEnabled)与震动(setVibrate)能力 ----
  private openSettings(): void {
    if (!this.settingsC) return;
    this.settingsC.setVisible(true);
    this.settingsC.setDepth(100);
  }
  private closeSettings(): void {
    this.settingsC?.setVisible(false);
  }

  private buildSettingsModal(): void {
    const w = 560;
    const h = 320;
    const c = this.add.container(GAME_W / 2, GAME_H / 2).setDepth(100).setVisible(false);
    const overlay = this.add.rectangle(0, 0, GAME_W + 40, GAME_H + 40, 0x03070d, 0.72).setInteractive();
    c.add(overlay);
    const card = drawGlass(this, w, h, {
      radius: 28, fill: 0x0e2136, fillAlpha: 0.94, stroke: 0x4d8fd8, strokeAlpha: 0.9,
      strokeWidth: 3, glow: 0x2f7fd0, glowAlpha: 0.18
    });
    c.add(card);
    c.add(this.add.text(0, -h / 2 + 38, '设置', {
      fontFamily: 'monospace', fontSize: '21px', color: '#cfeaff'
    }).setOrigin(0.5).setDepth(102));
    const close = drawGlass(this, 40, 40, {
      radius: 14, fill: 0x1f3a5f, fillAlpha: 0.95, stroke: 0x4d7fb5
    }).setPosition(w / 2 - 34, -h / 2 + 34)
      .setInteractive(new Phaser.Geom.Rectangle(-20, -20, 40, 40), Phaser.Geom.Rectangle.Contains);
    close.on('pointerdown', () => this.closeSettings());
    c.add(close);
    c.add(this.add.text(w / 2 - 34, -h / 2 + 34, '✕', {
      fontFamily: 'monospace', fontSize: '18px', color: '#dff2ff'
    }).setOrigin(0.5).setDepth(103));

    // 音效开关
    const sfxLabel = this.add.text(-w / 2 + 60, -36, '音效：', {
      fontFamily: 'monospace', fontSize: '18px', color: '#eaf6ff'
    }).setOrigin(0, 0.5).setDepth(102);
    c.add(sfxLabel);
    const sfxState = this.add.text(-w / 2 + 60, 2, sfx.enabled ? '开' : '关', {
      fontFamily: 'monospace', fontSize: '26px', color: sfx.enabled ? '#4de8c2' : '#ff6b6b'
    }).setOrigin(0, 0.5).setDepth(102);
    c.add(sfxState);
    const sfxBtn = drawGlass(this, 150, 54, {
      radius: 18, fill: 0x1f3a5f, fillAlpha: 0.95, stroke: 0x4d8fd8
    }).setPosition(w / 2 - 90, -17)
      .setInteractive(new Phaser.Geom.Rectangle(-75, -27, 150, 54), Phaser.Geom.Rectangle.Contains);
    c.add(sfxBtn);
    c.add(this.add.text(w / 2 - 90, -17, '点击切换', {
      fontFamily: 'monospace', fontSize: '14px', color: '#bcd8f0'
    }).setOrigin(0.5).setDepth(103));

    // 震动开关
    const vibLabel = this.add.text(-w / 2 + 60, 66, '震动：', {
      fontFamily: 'monospace', fontSize: '18px', color: '#eaf6ff'
    }).setOrigin(0, 0.5).setDepth(102);
    c.add(vibLabel);
    const vibState = this.add.text(-w / 2 + 60, 104, vibrateEnabled() ? '开' : '关', {
      fontFamily: 'monospace', fontSize: '26px', color: vibrateEnabled() ? '#4de8c2' : '#ff6b6b'
    }).setOrigin(0, 0.5).setDepth(102);
    c.add(vibState);
    const vibBtn = drawGlass(this, 150, 54, {
      radius: 18, fill: 0x1f3a5f, fillAlpha: 0.95, stroke: 0x4d8fd8
    }).setPosition(w / 2 - 90, 85)
      .setInteractive(new Phaser.Geom.Rectangle(-75, -27, 150, 54), Phaser.Geom.Rectangle.Contains);
    c.add(vibBtn);
    c.add(this.add.text(w / 2 - 90, 85, '点击切换', {
      fontFamily: 'monospace', fontSize: '14px', color: '#bcd8f0'
    }).setOrigin(0.5).setDepth(103));

    const refresh = () => {
      sfxState.setText(sfx.enabled ? '开' : '关');
      sfxState.setColor(sfx.enabled ? '#4de8c2' : '#ff6b6b');
      vibState.setText(vibrateEnabled() ? '开' : '关');
      vibState.setColor(vibrateEnabled() ? '#4de8c2' : '#ff6b6b');
    };
    sfxBtn.on('pointerdown', () => {
      sfx.unlock();                       // 首次手势解锁音频
      const next = !sfx.enabled;
      sfx.setEnabled(next);
      if (next) sfx.coin();               // 开启时给一声确认音
      refresh();
      this.showHint(`音效 → ${next ? '开' : '关'}`);
    });
    vibBtn.on('pointerdown', () => {
      const next = !vibrateEnabled();
      setVibrate(next);
      if (next) vibrate(25);              // 开启时给一次震动确认
      refresh();
      this.showHint(`震动 → ${next ? '开' : '关'}`);
    });

    this.settingsC = c;
  }

  // ---- 通用提示/金币抖动 ----
  private flashGold(): void {
    if (!this.goldCapsule) return;
    this.tweens.add({
      targets: this.goldCapsule, x: this.goldCapsule.x + 8, duration: 60, yoyo: true, repeat: 2
    });
    this.showHint('金币不足，先去战斗攒金币吧');
  }

  private showHint(msg: string): void {
    if (this.hintText) this.hintText.destroy();
    this.hintText = this.add.text(GAME_W / 2, 636, msg, {
      fontFamily: 'monospace', fontSize: '15px', color: '#ffd447',
      stroke: '#062033', strokeThickness: 3
    }).setOrigin(0.5).setDepth(60);
    this.time.delayedCall(2000, () => {
      this.hintText?.destroy();
      this.hintText = null;
    });
  }
}
