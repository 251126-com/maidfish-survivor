// 主菜单：开始游戏 + 局外永久强化商店（金币消费）
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config/balance.ts';
import { META_TREE } from '../config/upgrades.ts';
import { loadSave, writeSave } from '../core/save.ts';

export class MenuScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;

  constructor() { super('Menu'); }

  create(): void {
    const save = loadSave();

    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0a1420, 1);

    // 标题
    this.add.text(GAME_W / 2, 70, '女仆鲨鱼 · 割草求生', {
      fontFamily: 'monospace', fontSize: '44px', color: '#7fd4ff'
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 118, '自动射击 · 走位生存 · 12 分钟撑到底', {
      fontFamily: 'monospace', fontSize: '16px', color: '#6f93b3'
    }).setOrigin(0.5);

    // 最佳记录
    const mm = Math.floor(save.best.time / 60);
    const ss = Math.floor(save.best.time % 60);
    this.add.text(GAME_W / 2, 150, `最佳：${mm}分${ss}秒 · 击杀 ${save.best.kills} · 最高 Lv.${save.best.level}`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#9fd8ff'
    }).setOrigin(0.5);

    // 开始按钮
    const btn = this.add.rectangle(GAME_W / 2, 230, 300, 76, 0x2f7fd0, 1)
      .setStrokeStyle(3, 0x9fe8ff)
      .setInteractive({ useHandCursor: true });
    this.add.text(GAME_W / 2, 230, '开始游戏', {
      fontFamily: 'monospace', fontSize: '28px', color: '#ffffff'
    }).setOrigin(0.5);
    btn.on('pointerover', () => btn.setFillStyle(0x3f9fe8));
    btn.on('pointerout', () => btn.setFillStyle(0x2f7fd0));
    btn.on('pointerdown', () => this.scene.start('Game'));

    // 商店
    this.add.text(GAME_W / 2, 300, '— 永久强化（金币保留，越打越强）—', {
      fontFamily: 'monospace', fontSize: '16px', color: '#8fb8d8'
    }).setOrigin(0.5);

    this.goldText = this.add.text(GAME_W / 2, 330, `金币：${save.gold}`, {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffd447'
    }).setOrigin(0.5);

    this.buildShop(save.gold);

    this.add.text(GAME_W / 2, GAME_H - 26, '触摸拖动 / WASD 移动 · 自动开火', {
      fontFamily: 'monospace', fontSize: '13px', color: '#54708c'
    }).setOrigin(0.5);
  }

  private buildShop(gold: number): void {
    const cols = 3;
    const cardW = 320;
    const cardH = 74;
    const gapX = 30;
    const gapY = 16;
    const totalW = cardW * cols + gapX * (cols - 1);
    const startX = (GAME_W - totalW) / 2 + cardW / 2;
    const startY = 400;

    META_TREE.forEach((m, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cardW + gapX);
      const cy = startY + row * (cardH + gapY);

      const save = loadSave();
      const rank = save.meta[m.id] ?? 0;
      const maxed = rank >= m.maxRank;
      const cost = m.cost(rank);

      const card = this.add.rectangle(cx, cy, cardW, cardH, 0x101f33, 1)
        .setStrokeStyle(2, maxed ? 0x4de8c2 : 0x3d6c9e);
      this.add.text(cx - cardW / 2 + 14, cy - cardH / 2 + 12, `${m.name}  Lv.${rank}/${m.maxRank}`, {
        fontFamily: 'monospace', fontSize: '16px', color: '#eaf6ff'
      });
      this.add.text(cx - cardW / 2 + 14, cy - cardH / 2 + 36, m.desc, {
        fontFamily: 'monospace', fontSize: '12px', color: '#8fb8d8'
      });
      const priceLabel = maxed ? '已满级' : `${cost} 金币`;
      this.add.text(cx + cardW / 2 - 14, cy + 4, priceLabel, {
        fontFamily: 'monospace', fontSize: '15px',
        color: maxed ? '#4de8c2' : (gold >= cost ? '#ffd447' : '#7a8a9a')
      }).setOrigin(1, 0.5);

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