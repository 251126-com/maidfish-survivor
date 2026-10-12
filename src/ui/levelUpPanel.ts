// 升级三选一面板：全屏遮罩 + 三张可点击卡片
// v0.5.0 布局修复：
//  - 每个子对象（kind/name/desc）有独立基准坐标，淡入 tween 只做整体轻微上浮，
//    不再把所有文字 tween 到同一 y（v0.4.0：描述覆盖标题 bug 的根因）。
//  - 描述按可用高度动态缩字号 + wordWrap 换行，保证不溢出卡片、不压到名称。
//  - 卡片宽随 GAME_W 自适应收缩，窄屏（横屏手机）不越界。
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config/balance.ts';
import { computeCardLayout, fitDescStyle, type PanelLayout } from './panelLayout.ts';
import type { UpgradeOption } from '../game/levelUp.ts';

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
  base: { bgY: number; kindY: number; nameY: number; descY: number };
}

export class LevelUpPanel {
  private scene: Phaser.Scene;
  private overlay: Phaser.GameObjects.Rectangle;
  private title: Phaser.GameObjects.Text;
  private cards: CardView[] = [];
  private onPick: ((index: number) => void) | null = null;
  private layout: PanelLayout;
  visible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.layout = computeCardLayout(GAME_W, GAME_H, 3);

    this.overlay = scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.72)
      .setDepth(200).setScrollFactor(0).setInteractive();   // 吞掉点击，防止误触游戏

    this.title = scene.add.text(GAME_W / 2, this.layout.titleY, '升级！选择一项强化', {
      fontFamily: 'monospace', fontSize: '30px', color: '#eaf6ff'
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0);

    for (let i = 0; i < this.layout.cards.length; i++) {
      const c = this.layout.cards[i];
      const cardW = this.layout.cardW;
      const cardH = this.layout.cardH;

      const bg = scene.add.rectangle(c.cx, c.cy, cardW, cardH, 0x101f33, 0.98)
        .setDepth(201).setScrollFactor(0).setStrokeStyle(3, 0x3d6c9e)
        .setInteractive({ useHandCursor: true });

      const border = scene.add.rectangle(c.cx, c.cy, cardW, cardH)
        .setDepth(202).setScrollFactor(0).setFillStyle(0x000000, 0);

      const kind = scene.add.text(c.cx, c.kindY, '', {
        fontFamily: 'monospace', fontSize: '15px', color: '#9fd8ff'
      }).setOrigin(0.5).setDepth(202).setScrollFactor(0);

      const name = scene.add.text(c.cx, c.nameY, '', {
        fontFamily: 'monospace', fontSize: '22px', color: '#ffffff',
        align: 'center', wordWrap: { width: cardW - 40 }
      }).setOrigin(0.5).setDepth(202).setScrollFactor(0);

      const desc = scene.add.text(c.cx, c.descY, '', {
        fontFamily: 'monospace', fontSize: '15px', color: '#a8c4dc',
        align: 'center', wordWrap: { width: cardW - 50 }
      }).setOrigin(0.5).setDepth(202).setScrollFactor(0);

      bg.on('pointerover', () => bg.setStrokeStyle(3, 0x7fd4ff));
      bg.on('pointerout', () => bg.setStrokeStyle(3, 0x3d6c9e));
      bg.on('pointerdown', () => {
        if (this.onPick) this.onPick(i);
      });

      this.cards.push({
        bg, border, kind, name, desc,
        base: { bgY: c.cy, kindY: c.kindY, nameY: c.nameY, descY: c.descY }
      });
    }

    this.setVisible(false);
  }

  private setCardAlpha(c: CardView, a: number): void {
    c.bg.setAlpha(a);
    c.border.setAlpha(a);
    c.kind.setAlpha(a);
    c.name.setAlpha(a);
    c.desc.setAlpha(a);
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
    const cardW = this.layout.cardW;
    const cardH = this.layout.cardH;
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
      // 描述：按"名称下方 → 卡片底边留 16px"的可用高度动态缩字号，绝不溢出卡片
      const descTop = c.base.descY;
      const descMaxH = (c.base.bgY + cardH / 2 - 10) - descTop;
      const fit = fitDescStyle(o.desc, cardW - 50, Math.max(40, descMaxH), 15, 12);
      c.desc.setStyle({
        fontSize: `${fit.fontSize}px`,
        wordWrap: { width: cardW - 50 }
      });
      c.desc.setText(o.desc);
      c.bg.setStrokeStyle(3, KIND_COLOR[o.kind] ?? 0x3d6c9e);
    }
    this.title.setVisible(true);
    this.overlay.setVisible(true);
    for (let i = 0; i < options.length; i++) {
      const c = this.cards[i];
      if (!c) continue;
      // 全部归位到独立基准坐标
      c.bg.setVisible(true); c.kind.setVisible(true);
      c.name.setVisible(true); c.desc.setVisible(true);
      this.setCardAlpha(c, 0);
      // 整体 +24 轻微下移作为淡入起点，然后 tween 回自己的基准高度（各自独立，不重叠）
      const off = 24;
      const base = c.base;
      c.bg.y = base.bgY + off; c.border.y = base.bgY + off;
      c.kind.y = base.kindY + off; c.name.y = base.nameY + off; c.desc.y = base.descY + off;
      this.scene.tweens.add({
        targets: [c.bg, c.border, c.kind, c.name, c.desc],
        alpha: 1,
        y: [base.bgY, base.bgY, base.kindY, base.nameY, base.descY],
        duration: 260,
        ease: 'Cubic.easeOut',
        delay: i * 70
      });
    }
    this.visible = true;
  }

  hide(): void {
    this.onPick = null;
    // 结束可能还在播放的淡入动画，恢复完整透明度供下次使用
    this.scene.tweens.killTweensOf(this.cards.map(c => [c.bg, c.border, c.kind, c.name, c.desc]).flat());
    for (const c of this.cards) this.setCardAlpha(c, 1);
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
