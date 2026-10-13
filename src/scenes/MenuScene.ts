// 主菜单：开始游戏（可选起始场景）+ 局外永久强化商店（金币消费）
// v0.8.0：新增「起始场景」四卡选择 —— 四张授权背景首屏即可见、可点选，
//         选中项作为开局背景传给 GameScene（正常玩法仍默认随机轮换）。
// v0.9.0：菜单重设计 —— 顶部标题区 / 独立「开始游戏」面板 / 独立「永久强化」商店面板，
//         蓝白层级清晰、面板分区不拥挤；开始按钮保持在 (640,230) 兼容既有 e2e。
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config/balance.ts';
import { coverFit } from '../config/cover.ts';
import { BG_ORDER, randomStartIndex } from '../config/background.ts';
import { META_TREE } from '../config/upgrades.ts';
import { loadSave, writeSave } from '../core/save.ts';
import { VERSION } from '../config/version.ts';

export class MenuScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;
  /** 当前选择的起始背景下标（0..3），默认随机 */
  private bgPick = randomStartIndex();
  private bgCards: Phaser.GameObjects.Rectangle[] = [];
  private bgLabels: Phaser.GameObjects.Text[] = [];
  private bgImage!: Phaser.GameObjects.Image;
  private bgNameText!: Phaser.GameObjects.Text;
  private bgMask!: Phaser.GameObjects.Rectangle;

  constructor() { super('Menu'); }

  create(): void {
    const save = loadSave();

    // 背景：默认随机一张授权背景作为菜单底图，随选择实时更换（首屏即见四张）
    this.bgImage = this.add.image(0, 0, BG_ORDER[this.bgPick].key)
      .setOrigin(0, 0);
    this.bgMask = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0a1420, 0.66)
      .setDepth(1);
    this.applyBg();

    // ============ 顶部标题区（留白透气，蓝白主色） ============
    this.add.text(GAME_W / 2, 52, '鲸鱼娘 · 割草求生', {
      fontFamily: 'monospace', fontSize: '42px', color: '#7fd4ff',
      stroke: '#062033', strokeThickness: 6
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 98, '自动射击 · 走位生存 · 12 分钟撑到底', {
      fontFamily: 'monospace', fontSize: '16px', color: '#8fb8d8'
    }).setOrigin(0.5);
    const mm = Math.floor(save.best.time / 60);
    const ss = Math.floor(save.best.time % 60);
    this.add.text(GAME_W / 2, 128, `最佳：${mm}分${ss}秒 · 击杀 ${save.best.kills} · 最高 Lv.${save.best.level}`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#cfeaff'
    }).setOrigin(0.5).setDepth(2);

    // ============ 独立面板①：开始游戏（主按钮 + 起始场景选择） ============
    this.add.rectangle(GAME_W / 2, 236, 620, 196, 0x0c1c2e, 0.88)
      .setStrokeStyle(2, 0x2f6fc0).setDepth(1);
    this.add.text(GAME_W / 2, 166, '开始游戏', {
      fontFamily: 'monospace', fontSize: '15px', color: '#9fd8ff'
    }).setOrigin(0.5).setDepth(2);

    // 主 CTA（位置保持 640,230 兼容既有 e2e 点击）
    const btn = this.add.rectangle(GAME_W / 2, 216, 320, 62, 0x2f7fd0, 1)
      .setStrokeStyle(3, 0x9fe8ff)
      .setInteractive({ useHandCursor: true })
      .setDepth(2);
    this.add.text(GAME_W / 2, 216, '开始游戏', {
      fontFamily: 'monospace', fontSize: '28px', color: '#ffffff'
    }).setOrigin(0.5).setDepth(3);
    btn.on('pointerover', () => btn.setFillStyle(0x3f9fe8));
    btn.on('pointerout', () => btn.setFillStyle(0x2f7fd0));
    btn.on('pointerdown', () => this.scene.start('Game', { bgStart: this.bgPick }));

    this.add.text(GAME_W / 2, 266, '起始场景（局内每 60 秒自动轮换）', {
      fontFamily: 'monospace', fontSize: '13px', color: '#7aa7c8'
    }).setOrigin(0.5).setDepth(2);
    this.buildBgPicker();   // 卡片 y=300，选中底名提示由 applyBg 显示在 y=336

    // ============ 独立面板②：永久强化商店 ============
    this.add.rectangle(GAME_W / 2, 516, 1160, 336, 0x0c1c2e, 0.88)
      .setStrokeStyle(2, 0x2f6fc0).setDepth(1);
    this.add.text(GAME_W / 2, 388, '— 永久强化（金币保留，越打越强）—', {
      fontFamily: 'monospace', fontSize: '16px', color: '#bcd8f0'
    }).setOrigin(0.5).setDepth(2);

    this.goldText = this.add.text(GAME_W - 78, 388, `金币：${save.gold}`, {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffd447'
    }).setOrigin(1, 0.5).setDepth(2);

    this.buildShop(save.gold);

    this.add.text(GAME_W / 2, 662, '金币永久保留 · 强化效果跨局叠加 · 点击卡片购买', {
      fontFamily: 'monospace', fontSize: '13px', color: '#54708c'
    }).setOrigin(0.5).setDepth(2);

    this.add.text(GAME_W / 2, GAME_H - 22, `触摸拖动 / WASD 移动 · 自动开火 · v${VERSION}`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#54708c'
    }).setOrigin(0.5).setDepth(2);

    // 自动化钩子：e2e 可读取/设置当前选中的起始场景
    (window as unknown as { __MENU_BG?: { get: () => number; set: (i: number) => void; count: number } }).__MENU_BG = {
      get: () => this.bgPick,
      set: (i: number) => this.pickBg(i),
      count: BG_ORDER.length
    };
  }

  // 四张背景卡：横排，高亮选中的一张；点选即换底图并记住起始背景
  private buildBgPicker(): void {
    const n = BG_ORDER.length;
    const cardW = 140;
    const cardH = 38;
    const gap = 14;
    const totalW = cardW * n + gap * (n - 1);
    const startX = (GAME_W - totalW) / 2 + cardW / 2;
    const y = 300;

    for (let i = 0; i < n; i++) {
      const cx = startX + i * (cardW + gap);
      const bg = this.add.rectangle(cx, y, cardW, cardH, i === this.bgPick ? 0x2f7fd0 : 0x16283f, 1)
        .setStrokeStyle(2, i === this.bgPick ? 0x9fe8ff : 0x3d6c9e)
        .setInteractive({ useHandCursor: true })
        .setDepth(2);
      const label = this.add.text(cx, y, BG_ORDER[i].name, {
        fontFamily: 'monospace', fontSize: '15px',
        color: i === this.bgPick ? '#ffffff' : '#bcd8f0'
      }).setOrigin(0.5).setDepth(3);
      bg.on('pointerover', () => bg.setFillStyle(i === this.bgPick ? 0x2f7fd0 : 0x1f3a5f));
      bg.on('pointerout', () => bg.setFillStyle(i === this.bgPick ? 0x2f7fd0 : 0x16283f));
      bg.on('pointerdown', () => this.pickBg(i));
      this.bgCards.push(bg);
      this.bgLabels.push(label);
    }
  }

  private pickBg(i: number): void {
    if (i < 0 || i >= BG_ORDER.length) return;
    this.bgPick = i;
    this.applyBg();
    for (let k = 0; k < this.bgCards.length; k++) {
      const sel = k === this.bgPick;
      this.bgCards[k].setFillStyle(sel ? 0x2f7fd0 : 0x16283f);
      this.bgCards[k].setStrokeStyle(2, sel ? 0x9fe8ff : 0x3d6c9e);
      this.bgLabels[k].setColor(sel ? '#ffffff' : '#bcd8f0');
    }
  }

  // 底图按当前选自换纹理 + cover 铺满 + 名字提示（在开始面板底部）
  private applyBg(): void {
    const phase = BG_ORDER[this.bgPick];
    this.bgImage.setTexture(phase.key);
    const src = this.textures.get(phase.key).getSourceImage();
    const cover = coverFit(src.width, src.height, GAME_W, GAME_H);
    this.bgImage.setDisplaySize(cover.w, cover.h);
    this.bgImage.setDepth(0);
    if (this.bgNameText) this.bgNameText.destroy();
    this.bgNameText = this.add.text(GAME_W / 2, 336, `起始：${phase.name}  ·  点击开始进入`, {
      fontFamily: 'monospace', fontSize: '12px', color: '#9fd8ff'
    }).setOrigin(0.5).setDepth(2);
  }

  private buildShop(gold: number): void {
    const cols = 3;
    const cardW = 348;
    const cardH = 78;
    const gapX = 26;
    const gapY = 16;
    const totalW = cardW * cols + gapX * (cols - 1);
    const startX = (GAME_W - totalW) / 2 + cardW / 2;
    const startY = 432;

    META_TREE.forEach((m, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cardW + gapX);
      const cy = startY + row * (cardH + gapY);

      const save = loadSave();
      const rank = save.meta[m.id] ?? 0;
      const maxed = rank >= m.maxRank;
      const cost = m.cost(rank);

      const card = this.add.rectangle(cx, cy, cardW, cardH, 0x14263c, 1)
        .setStrokeStyle(2, maxed ? 0x4de8c2 : 0x3d6c9e)
        .setDepth(2);
      this.add.text(cx - cardW / 2 + 14, cy - cardH / 2 + 12, `${m.name}  Lv.${rank}/${m.maxRank}`, {
        fontFamily: 'monospace', fontSize: '16px', color: '#eaf6ff'
      }).setDepth(3);
      this.add.text(cx - cardW / 2 + 14, cy - cardH / 2 + 40, m.desc, {
        fontFamily: 'monospace', fontSize: '12px', color: '#8fb8d8'
      }).setDepth(3);
      const priceLabel = maxed ? '已满级' : `${cost} 金币`;
      this.add.text(cx + cardW / 2 - 14, cy + 4, priceLabel, {
        fontFamily: 'monospace', fontSize: '15px',
        color: maxed ? '#4de8c2' : (gold >= cost ? '#ffd447' : '#7a8a9a')
      }).setOrigin(1, 0.5).setDepth(3);

      if (!maxed) {
        card.setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => {
          const s = loadSave();
          const r = s.meta[m.id] ?? 0;
          if (r >= m.maxRank) return;
          const c = m.cost(r);
          if (s.gold < c) {
            this.flashGold();
            return;
          }
          s.gold -= c;
          s.meta[m.id] = r + 1;
          writeSave(s);
          this.scene.restart();   // 重载界面刷新所有数值
        });
      }
    });
  }

  private flashGold(): void {
    this.tweens.add({
      targets: this.goldText,
      x: this.goldText.x + 8,
      duration: 60,
      yoyo: true,
      repeat: 2
    });
  }
}
