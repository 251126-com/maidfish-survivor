// 升级三选一面板：全屏遮罩 + 三张可点击卡片
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config/balance.ts';
import type { UpgradeOption } from '../game/levelUp.ts';

const CARD_W = 320;
const CARD_H = 400;
const GAP = 40;

const KIND_LABEL: Record<string, string> = {
  new_weapon: '新武器',
  weapon_level: '武器强化',
  buff: '属性提升',
  passive: '被动道具',
  evolution: '★ 进 化 ★'
};
const KIND_COLOR: Record<string, number> = {
  new_weapon: 0x3a7bd5,
  weapon_level: 0x2f9e77,
  buff: 0xb0762f,
  passive: 0x7a5cc4,
  evolution: 0xffb020      // 进化用金边，一眼能认出来
};

interface CardView {
  bg: Phaser.GameObjects.Rectangle;
  border: Phaser.GameObjects.Rectangle;
  kind: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
}

export class LevelUpPanel {
  private scene: Phaser.Scene;
  private overlay: Phaser.GameObjects.Rectangle;
  private title: Phaser.GameObjects.Text;
  private cards: CardView[] = [];
  private onPick: ((index: number) => void) | null = null;
  visible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.overlay = scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.72)
      .setDepth(200).setScrollFactor(0).setInteractive();   // 吞掉点击，防止误触游戏

    this.title = scene.add.text(GAME_W / 2, 60, '升级！选择一项强化', {
      fontFamily: 'monospace', fontSize: '30px', color: '#eaf6ff'
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0);

    const totalW = CARD_W * 3 + GAP * 2;
    const startX = (GAME_W - totalW) / 2 + CARD_W / 2;
    const cy = GAME_H / 2 + 30;

    for (let i = 0; i < 3; i++) {
      const cx = startX + i * (CARD_W + GAP);

      const bg = scene.add.rectangle(cx, cy, CARD_W, CARD_H, 0x101f33, 0.98)
        .setDepth(201).setScrollFactor(0).setStrokeStyle(3, 0x3d6c9e)
        .setInteractive({ useHandCursor: true });

      const border = scene.add.rectangle(cx, cy, CARD_W, CARD_H)
        .setDepth(202).setScrollFactor(0).setFillStyle(0x000000, 0);

      const kind = scene.add.text(cx, cy - CARD_H / 2 + 26, '', {
        fontFamily: 'monospace', fontSize: '15px', color: '#9fd8ff'
      }).setOrigin(0.5).setDepth(202).setScrollFactor(0);

      const name = scene.add.text(cx, cy - 60, '', {
        fontFamily: 'monospace', fontSize: '22px', color: '#ffffff',
        align: 'center', wordWrap: { width: CARD_W - 40 }
      }).setOrigin(0.5).setDepth(202).setScrollFactor(0);

      const desc = scene.add.text(cx, cy + 40, '', {
        fontFamily: 'monospace', fontSize: '15px', color: '#a8c4dc',
        align: 'center', wordWrap: { width: CARD_W - 50 }
      }).setOrigin(0.5).setDepth(202).setScrollFactor(0);

      bg.on('pointerover', () => bg.setStrokeStyle(3, 0x7fd4ff));
      bg.on('pointerout', () => bg.setStrokeStyle(3, 0x3d6c9e));
      bg.on('pointerdown', () => {
        if (this.onPick) this.onPick(i);
      });

      this.cards.push({ bg, border, kind, name, desc });
    }

    this.setVisible(false);
  }

  private setVisible(v: boolean): void {
    this.overlay.setVisible(v);
    this.title.setVisible(v);
    for (const c of this.cards) {
      c.bg.setVisible(v);
      c.border.setVisible(v);
      c.kind.setVisible(v);
      c.name.setVisible(v);
      c.desc.setVisible(v);
    }
    this.visible = v;
  }

  show(options: UpgradeOption[], onPick: (index: number) => void): void {
    this.onPick = onPick;
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i];
      const o = options[i];
      if (!o) {
        c.bg.setVisible(false); c.border.setVisible(false);
        c.kind.setVisible(false); c.name.setVisible(false); c.desc.setVisible(false);
        continue;
      }
      c.kind.setText(KIND_LABEL[o.kind] ?? '');
      c.name.setText(o.name);
      c.desc.setText(o.desc);
      c.bg.setStrokeStyle(3, KIND_COLOR[o.kind] ?? 0x3d6c9e);
    }
    this.title.setVisible(true);
    this.overlay.setVisible(true);
    for (let i = 0; i < options.length; i++) {
      const c = this.cards[i];
      if (!c) continue;
      c.bg.setVisible(true); c.kind.setVisible(true);
      c.name.setVisible(true); c.desc.setVisible(true);
    }
    this.visible = true;
  }

  hide(): void {
    this.onPick = null;
    this.setVisible(false);
  }

  destroy(): void {
    this.overlay.destroy();
    this.title.destroy();
    for (const c of this.cards) {
      c.bg.destroy(); c.border.destroy(); c.kind.destroy(); c.name.destroy(); c.desc.destroy();
    }
    this.cards.length = 0;
  }
}