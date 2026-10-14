// 主菜单（v0.15.0 大厅重做 = 好看鱼缸）：不再堆叠功能面板，整个大厅就是一座
// 生动、有呼吸感的深海鱼缸——深蓝冷调 + 顶部光斑光影 + 上升气泡 + 水草摇曳 +
// 砂砾 + 睡觉/游动的鲸鱼娘(女仆装/饭盆头)。功能入口融入场景：
// 「开始游戏」为视觉焦点(大号发光玻璃按钮)，皮肤/永久强化/背景选择为融入场景的玻璃入口。
// 皮肤/强化/背景均以圆角半透明玻璃弹窗呈现；角色系统已移除（唯一鲸鱼娘）。
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config/balance.ts';
import { BG_ORDER, randomStartIndex } from '../config/background.ts';
import { META_TREE } from '../config/upgrades.ts';
import { DEFAULT_SKIN, SKIN_BOWL, SKIN_MAID, SKINS, isSkinId, type SkinId } from '../config/characters.ts';
import { loadSave, writeSave, setSkin } from '../core/save.ts';
import { faceScreenOffset } from '../game/playerFx.ts';
import { VERSION } from '../config/version.ts';
import { glassButton, drawGlass, type GlassButton } from '../ui/glassUI.ts';

// 购买/换肤后 scene.restart() 会重建实例，模块级变量跨实例保留用户选中的起始背景
let lastBgPick: number | null = null;

export class MenuScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;
  private hintText: Phaser.GameObjects.Text | null = null;
  /** 当前选择的起始背景下标（0..3），默认随机；重载后沿用上次选择 */
  private bgPick = lastBgPick ?? randomStartIndex();
  /** v0.15.0 当前皮肤（女仆装默认/饭盆头可切换） */
  private skin: SkinId = DEFAULT_SKIN;
  private skinBtn: GlassButton | null = null;

  // 鱼缸活动元素引用（update 里驱动水草摇曳等）
  private seaweeds: Phaser.GameObjects.Container[] = [];
  private bubbles: Phaser.GameObjects.Arc[] = [];
  private rayG: Phaser.GameObjects.Graphics[] = [];
  private causticG: Phaser.GameObjects.Graphics | null = null;

  // 弹窗（默认隐藏，按钮唤起）
  private shopC: Phaser.GameObjects.Container | null = null;
  private bgC: Phaser.GameObjects.Container | null = null;

  constructor() { super('Menu'); }

  create(): void {
    const save = loadSave();
    this.skin = isSkinId(save.skin) ? save.skin : DEFAULT_SKIN;

    // ============ 鱼缸场景（全屏水面 + 光斑 + 气泡 + 水草 + 鲸鱼娘） ============
    this.buildWaterBase();
    this.buildLightRays();
    this.buildSeafloor();
    this.buildBubbles();
    this.buildWhale();

    // ============ 顶部信息（融于水面的蓝白文字） ============
    this.add.text(GAME_W / 2, 54, '鲸鱼娘 · 割草求生', {
      fontFamily: 'monospace', fontSize: '46px', color: '#9fe0ff',
      stroke: '#04304f', strokeThickness: 7
    }).setOrigin(0.5).setDepth(4).setShadow(0, 0, '#3f9fe8', 4, true, true);
    this.add.text(GAME_W / 2, 102, '自动射击 · 走位生存 · 12 分钟撑到底', {
      fontFamily: 'monospace', fontSize: '17px', color: '#a8c8e8'
    }).setOrigin(0.5).setDepth(4);
    const mm = Math.floor(save.best.time / 60);
    const ss = Math.floor(save.best.time % 60);
    this.add.text(GAME_W / 2, 132, `最佳：${mm}分${ss}秒 · 击杀 ${save.best.kills} · 最高 Lv.${save.best.level}`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#d8ecff'
    }).setOrigin(0.5).setDepth(4).setAlpha(0.9);

    // 金币（右上，玻璃小牌）
    this.goldText = this.add.text(GAME_W - 64, 58, `金币 ${save.gold}`, {
      fontFamily: 'monospace', fontSize: '22px', color: '#ffd447',
      stroke: '#4a3000', strokeThickness: 5
    }).setOrigin(1, 0.5).setDepth(5);

    // ============ 主 CTA（视觉焦点：大号发光玻璃按钮） ============
    glassButton(this, GAME_W / 2, 452, 360, 84, '▶  开始游戏', {
      fill: 0x1e5fae, fillAlpha: 0.92, stroke: 0x7fd4ff, strokeWidth: 4,
      glow: 0x3f9fe8, glowAlpha: 0.5, radius: 30, depth: 6,
      fontSize: 32, color: '#ffffff'
    }, () => this.scene.start('Game', { bgStart: this.bgPick }));
    // CTA 常驻呼吸光晕（柔光层动画，克制开销：只动 1 个 graphics 的 alpha）
    const pulse = this.add.graphics().setDepth(5.5);
    this.tweens.add({
      targets: pulse, alpha: 0.25, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
    const drawPulse = () => {
      pulse.clear();
      pulse.fillStyle(0x3f9fe8, 0.22);
      pulse.fillRoundedRect(GAME_W / 2 - 200, 452 - 52, 400, 104, 34);
    };
    drawPulse();
    this.time.addEvent({ delay: 2000, loop: true, callback: drawPulse });

    // ============ 次要入口（融入鱼缸氛围的玻璃小按钮行） ============
    this.skinBtn = glassButton(this, 360, 566, 250, 56, this.skinLabel(), {
      fill: 0x12304c, fillAlpha: 0.55, stroke: 0x4d8fd8, strokeWidth: 2,
      glow: 0x2f7fd0, glowAlpha: 0.15, radius: 24, depth: 6, fontSize: 18
    }, () => this.handleSkinClick());
    glassButton(this, 640, 566, 250, 56, '⚡  永久强化', {
      fill: 0x12304c, fillAlpha: 0.55, stroke: 0x4d8fd8, strokeWidth: 2,
      glow: 0x2f7fd0, glowAlpha: 0.15, radius: 24, depth: 6, fontSize: 18
    }, () => this.openShop());
    glassButton(this, 920, 566, 250, 56, '🌌  背景选择', {
      fill: 0x12304c, fillAlpha: 0.55, stroke: 0x4d8fd8, strokeWidth: 2,
      glow: 0x2f7fd0, glowAlpha: 0.15, radius: 24, depth: 6, fontSize: 18
    }, () => this.openBg());

    this.add.text(GAME_W / 2, GAME_H - 20, `触摸拖动 / WASD 移动 · 自动开火 · v${VERSION}`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#6f93b3'
    }).setOrigin(0.5).setDepth(4);

    // 弹窗（商店/背景）——先构建后默认隐藏
    this.buildShopModal();
    this.buildBgModal();

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
  }

  // ---- 每帧：水草摇曳（容器段 x 正弦偏移，无重绘、开销可控） ----
  private seaT = 0;
  update(_t: number, delta: number): void {
    this.seaT += delta / 1000;
    for (let i = 0; i < this.seaweeds.length; i++) {
      const c = this.seaweeds[i];
      const kids = c.list as Phaser.GameObjects.Rectangle[];
      for (let j = 0; j < kids.length; j++) {
        const seg = kids[j] as Phaser.GameObjects.Rectangle & { bx: number; ph: number };
        seg.x = seg.bx + Math.sin(this.seaT * seg.ph + i * 1.7) * (2 + j * 3.2);
        seg.angle = Math.sin(this.seaT * seg.ph + i * 1.7) * (1 + j * 1.6);
      }
    }
  }

  // ---- 水面基底：Canvas 渐变 + 顶部柔光斑（一次性纹理） ----
  private buildWaterBase(): void {
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
      // 顶部水面光斑（柔光，几团交错）
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const x = 60 + i * 190 + Math.random() * 80;
        const y = 8 + Math.random() * 70;
        const r = 110 + Math.random() * 100;
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, 'rgba(130,205,255,0.14)');
        rg.addColorStop(0.5, 'rgba(130,205,255,0.05)');
        rg.addColorStop(1, 'rgba(130,205,255,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
      this.textures.addCanvas('lobby_grad', c);
    }
    this.add.image(0, 0, 'lobby_grad').setOrigin(0, 0).setDepth(0);
  }

  // ---- 顶部斜射光柱 + 缓缓飘动的光斑（克制：3 根光柱 + 3 团光斑） ----
  private buildLightRays(): void {
    const rays = [
      { x: 180, w: 90, a: 0.05 },
      { x: 620, w: 130, a: 0.07 },
      { x: 1030, w: 100, a: 0.05 }
    ];
    for (const r of rays) {
      const g = this.add.graphics().setDepth(1);
      g.fillStyle(0xbfe8ff, r.a);
      g.beginPath();
      g.moveTo(r.x - r.w / 2, -10);
      g.lineTo(r.x + r.w / 2, -10);
      g.lineTo(r.x + r.w, GAME_H);
      g.lineTo(r.x - r.w, GAME_H);
      g.closePath();
      g.fillPath();
      this.rayG.push(g);
      this.tweens.add({
        targets: g, alpha: 0.35, duration: 2400 + Math.random() * 1200,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });
    }
    // 顶部水面光斑（柔光椭圆，缓慢游移）
    this.causticG = this.add.graphics().setDepth(1.5);
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

  // ---- 海底：砂砾 + 卵石 + 三丛水草（容器段做摇曳，见 update） ----
  private buildSeafloor(): void {
    const g = this.add.graphics().setDepth(2);
    // 砂砾带（两层，前浅后深）
    g.fillStyle(0x8a6a3a, 0.5);
    g.fillEllipse(GAME_W / 2, GAME_H + 24, 1500, 150);
    g.fillStyle(0xa98c50, 0.35);
    g.fillEllipse(GAME_W / 2, GAME_H + 12, 900, 80);
    // 卵石
    g.fillStyle(0x5b7896, 0.55);
    g.fillEllipse(210, GAME_H - 28, 34, 16);
    g.fillEllipse(430, GAME_H - 40, 22, 12);
    g.fillEllipse(1010, GAME_H - 32, 40, 18);
    g.fillStyle(0x3c5a76, 0.6);
    g.fillEllipse(880, GAME_H - 26, 26, 14);
    g.fillEllipse(1180, GAME_H - 44, 30, 14);

    // 三丛水草（容器 + 5 段椭圆，段带 bx/ph 供 update 摇曳）
    const stalks = [
      { x: 150, h: 150, color: 0x1f7a52 },
      { x: 1130, h: 190, color: 0x2fa86a },
      { x: 1230, h: 140, color: 0x1f8f5f }
    ];
    for (const st of stalks) {
      const c = this.add.container(st.x, GAME_H - 6).setDepth(2);
      const n = 5;
      for (let j = 0; j < n; j++) {
        const seg = this.add.rectangle(0, -(j * 26) - 12, 9, 30, st.color, 0.9);
        seg.setOrigin(0.5, 1);
        seg.setDepth(2);
        (seg as Phaser.GameObjects.Rectangle & { bx: number; ph: number }).bx = 0;
        (seg as Phaser.GameObjects.Rectangle & { bx: number; ph: number }).ph = 1.1 + j * 0.35 + st.h / 500;
        c.add(seg);
      }
      this.seaweeds.push(c);
    }
  }

  // ---- 上升气泡（14 颗，循环上飘；错峰、细水长流、克制开销） ----
  private buildBubbles(): void {
    for (let i = 0; i < 14; i++) {
      const x = 90 + Math.random() * (GAME_W - 180);
      const y = GAME_H - 30 - Math.random() * 120;
      const r = 2.5 + Math.random() * 3.5;
      const b = this.add.circle(x, y, r, 0xbfe8ff, 0.45).setDepth(2.5);
      this.bubbles.push(b);
      const dur = 3200 + Math.random() * 3200;
      const baseY = y;
      this.tweens.add({
        targets: b, y: -30, alpha: 0,
        duration: dur, delay: i * 260, repeat: -1,
        ease: 'Sine.easeIn',
        onRepeat: () => { b.setAlpha(0.45); b.x = 90 + Math.random() * (GAME_W - 180); b.y = baseY; }
      });
    }
  }

  // ---- 鲸鱼娘：睡觉（闭眼 + Zzz + 呼吸浮动）+ 缓缓游动 + 偶尔吐泡泡 ----
  private buildWhale(): void {
    const cx = 330;
    const cy = 320;
    const displayH = 152;
    const scale = displayH / Math.max(1, 320);

    const whale = this.add.image(cx, cy, 'player_whale');
    whale.setScale(scale);
    whale.setRotation(0.06);
    whale.setDepth(3);

    // v0.14.0 承诺过的长按入口：长按鲸鱼娘切换皮肤（女仆装<->饭盆头），
    // 松开/移出取消；与皮肤按钮等效，兑现「长按或按钮切换」承诺。
    whale.setInteractive();
    let holdTimer: Phaser.Time.TimerEvent | null = null;
    whale.on('pointerdown', () => {
      holdTimer = this.time.delayedCall(650, () => this.handleSkinClick());
    });
    whale.on('pointerup', () => { holdTimer?.remove(); holdTimer = null; });
    whale.on('pointerout', () => { holdTimer?.remove(); holdTimer = null; });

    // 闭眼表情（保持贴脸）
    const off = faceScreenOffset(displayH);
    const fx = this.add.image(cx + off.cx, cy + off.cy, 'fx_blink');
    fx.setScale(0.5, 0.5);
    fx.setDepth(3.5);

    // v0.15.0 饭盆头皮肤：头顶叠加饭盆
    let bowl: Phaser.GameObjects.Image | null = null;
    if (this.skin === SKIN_BOWL) {
      const bowlH = 54 * (displayH / 112);
      const bowlOff = 50 * (displayH / 112);
      bowl = this.add.image(cx, cy - bowlOff, 'rice_bowl');
      bowl.setScale(bowlH / Math.max(1, 96));
      bowl.setDepth(4);
    }

    // 呼吸浮动（身体+表情+饭盆同步贴脸）
    this.tweens.add({ targets: whale, y: cy + 5, duration: 2100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: fx, y: cy + off.cy - 3, duration: 2100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    if (bowl) this.tweens.add({ targets: bowl, y: cy - 50 * (displayH / 112) + 5, duration: 2100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // 缓缓游动（水平漂移，慢且轻）
    this.tweens.add({ targets: whale, x: cx - 36, duration: 6000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: fx, x: cx + off.cx - 36, duration: 6000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    if (bowl) this.tweens.add({ targets: bowl, x: cx - 36, duration: 6000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Zzz 三档气泡（错峰循环上飘）
    for (let i = 0; i < 3; i++) {
      const z = this.add.text(cx + 46 + i * 13, cy - 30 - i * 22, i === 2 ? 'Z' : 'z', {
        fontFamily: 'monospace', fontSize: i === 2 ? '24px' : '16px', color: '#9fd8ff'
      }).setDepth(3).setAlpha(0);
      const baseY = cy - 30 - i * 22;
      this.tweens.add({
        targets: z, y: baseY - 84, alpha: 1,
        delay: i * 1100, duration: 2400, repeat: -1, repeatDelay: 900,
        ease: 'Sine.easeOut',
        onRepeat: () => { z.setAlpha(0); z.y = baseY; }
      });
    }

    // 偶尔吐泡泡（从嘴部冒 1 颗，间隔错开）
    this.time.addEvent({
      delay: 2600, loop: true,
      callback: () => {
        const bx = cx - 36 + Math.sin(this.seaT * 0.4) * 26 + 8;
        const by = cy + 26;
        const b = this.add.circle(bx, by, 3.5, 0xd8f2ff, 0.7).setDepth(3);
        this.tweens.add({
          targets: b, x: bx + 14, y: by - 70, alpha: 0,
          duration: 1900, ease: 'Sine.easeOut',
          onComplete: () => b.destroy()
        });
      }
    });
  }

  // ============ 功能入口 ============

  private skinLabel(): string {
    const s = this.skin === SKIN_BOWL ? SKINS[SKIN_BOWL].name : SKINS[SKIN_MAID].name;
    return `👗  皮肤：${s}`;
  }

  /** 皮肤切换：女仆装(默认) <-> 饭盆头(搞笑)，纯外观即写档，大厅鲸鱼娘同步换装 */
  private handleSkinClick(): void {
    const s = loadSave();
    const ns: SkinId = this.skin === SKIN_MAID ? SKIN_BOWL : SKIN_MAID;
    setSkin(s, ns);
    writeSave(s);
    this.skin = ns;
    this.skinBtn?.setLabel(this.skinLabel());
    this.showHint(ns === SKIN_MAID ? '皮肤 → 女仆装（默认 · 正常卖萌形态）' : '皮肤 → 饭盆头（搞笑形态）');
    // 重建大厅鲸鱼娘（换装即时生效）
    this.rebuildLobbyWhale(ns);
  }

  /** 重建大厅鲸鱼娘换装：销毁旧立绘层再按当前皮肤重建（仅换皮肤时调用，开销低） */
  private rebuildLobbyWhale(ns: SkinId): void {
    // 简单实现：整页重建比逐引用清理更稳妥（大厅无状态，动画会重新起）
    this.scene.restart();
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
    // 全屏暗幕（点击暗幕关闭）
    const overlay = this.add.rectangle(0, 0, GAME_W + 40, GAME_H + 40, 0x03070d, 0.72).setInteractive();
    c.add(overlay);
    // 玻璃卡片
    const card = drawGlass(this, w, h, {
      radius: 28, fill: 0x0e2136, fillAlpha: 0.94, stroke: 0x4d8fd8, strokeAlpha: 0.9,
      strokeWidth: 3, glow: 0x2f7fd0, glowAlpha: 0.18
    });
    card.setDepth(101);
    c.add(card);
    c.add(this.add.text(0, -h / 2 + 36, '永久强化（金币保留，越打越强）', {
      fontFamily: 'monospace', fontSize: '20px', color: '#cfeaff'
    }).setOrigin(0.5).setDepth(102));
    // 右上关闭
    const close = drawGlass(this, 40, 40, {
      radius: 14, fill: 0x1f3a5f, fillAlpha: 0.95, stroke: 0x4d7fb5
    }).setPosition(w / 2 - 34, -h / 2 + 34)
      .setInteractive(new Phaser.Geom.Rectangle(-20, -20, 40, 40), Phaser.Geom.Rectangle.Contains);
    close.on('pointerdown', () => this.closeShop());
    c.add(close);
    c.add(this.add.text(w / 2 - 34, -h / 2 + 34, '✕', {
      fontFamily: 'monospace', fontSize: '18px', color: '#dff2ff'
    }).setOrigin(0.5).setDepth(103));

    // 6 张强化卡（3 列 x 2 行，玻璃卡）
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
          this.goldText.setText(`金币 ${s.gold}`);
          this.rebuildShopModal();
          this.showHint(`${m.name} → Lv.${r + 1}`);
        });
      }
    });
  }

  private rebuildShopModal(): void {
    // 整卡重建（保留暗幕与关闭语义）
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

    // 4 张背景卡
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

  // ---- 通用提示/金币抖动 ----
  private flashGold(): void {
    if (!this.goldText) return;
    this.tweens.add({
      targets: this.goldText, x: this.goldText.x + 8, duration: 60, yoyo: true, repeat: 2
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
