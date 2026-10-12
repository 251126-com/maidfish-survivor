// 升级三选一面板：全屏遮罩 + 三张可点击卡片
//
// v0.5.1 布局修复（根因在 v0.5.0 引入）：
//  - v0.5.0 用 `y: [bgY, kindY, nameY, descY]` 数组想让每个对象各归其位，
//    但 Phaser 把属性数组当作"单目标关键帧路径"（start=value[0], end=value[last]），
//    5 个对象(含卡片背景)全部被 tween 到 descY=546 → 文字在卡片中心叠印。实测确认。
//  - 本版本：每个对象用独立 tween 归位到自己的基准 y（无数组语义歧义），
//    并由纯布局层 panelLayout 提供纵向分区（kind/name/desc），运行时用
//    Phaser 真实 canvas 度量对名称/描述自适应换行缩字，保证不越界、不交叠。
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config/balance.ts';
import { computeCardLayout, type PanelLayout, type CardBox } from './panelLayout.ts';
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

// 名称/描述的起始字号与最小字号（over fit 后仍由运行时 canvas 度量兜底）
const NAME_FONT = { start: 22, min: 15 };
const DESC_FONT = { start: 15, min: 11 };

interface CardView {
  bg: Phaser.GameObjects.Rectangle;
  border: Phaser.GameObjects.Rectangle;
  kind: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
  base: CardBox;
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
      const z = c.zone;

      const bg = scene.add.rectangle(c.cx, c.cy, this.layout.cardW, this.layout.cardH, 0x101f33, 0.98)
        .setDepth(201).setScrollFactor(0).setStrokeStyle(3, 0x3d6c9e)
        .setInteractive({ useHandCursor: true });

      const border = scene.add.rectangle(c.cx, c.cy, this.layout.cardW, this.layout.cardH)
        .setDepth(202).setScrollFactor(0).setFillStyle(0x000000, 0);

      const kind = scene.add.text(c.cx, z.kindY, '', {
        fontFamily: 'monospace', fontSize: '15px', color: '#9fd8ff'
      }).setOrigin(0.5).setDepth(202).setScrollFactor(0);

      const name = scene.add.text(c.cx, z.nameY, '', {
        fontFamily: 'monospace', fontSize: `${NAME_FONT.start}px`, color: '#ffffff',
        align: 'center', wordWrap: { width: z.nameMaxW }
      }).setOrigin(0.5).setDepth(202).setScrollFactor(0);

      const desc = scene.add.text(c.cx, z.descY, '', {
        fontFamily: 'monospace', fontSize: `${DESC_FONT.start}px`, color: '#a8c4dc',
        align: 'center', wordWrap: { width: z.descMaxW }
      }).setOrigin(0.5).setDepth(202).setScrollFactor(0);

      bg.on('pointerover', () => bg.setStrokeStyle(3, 0x7fd4ff));
      bg.on('pointerout', () => bg.setStrokeStyle(3, 0x3d6c9e));
      bg.on('pointerdown', () => {
        if (this.onPick) this.onPick(i);
      });

      this.cards.push({ bg, border, kind, name, desc, base: c });
    }

    this.setVisible(false);
  }

  // 把文本放进 maxW x maxH 区域：用 Phaser 真实 canvas 度量 setText 后的宽高，
  // 放不下就逐字号缩小，保证不溢出（比纯估算可靠，兼容任意设备字体回退）。
  private fitTextToZone(
    t: Phaser.GameObjects.Text,
    text: string,
    maxW: number,
    maxH: number,
    start: number,
    min: number
  ): void {
    let fs = start;
    for (;;) {
      t.setStyle({ fontSize: `${fs}px`, wordWrap: { width: maxW } });
      t.setText(text);
      if (t.height <= maxH + 0.01 || fs <= min) break;
      fs--;
    }
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
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i];
      const o = options[i];
      if (!o) {
        c.bg.setVisible(false); c.border.setVisible(false);
        c.kind.setVisible(false); c.name.setVisible(false); c.desc.setVisible(false);
        continue;
      }
      const z = c.base.zone;
      c.kind.setText(KIND_LABEL[o.kind] ?? '');
      // 名称：在 name 分区内自适应换行/缩字，绝不压到 kind 或 desc
      this.fitTextToZone(c.name, o.name, z.nameMaxW, z.nameMaxH, NAME_FONT.start, NAME_FONT.min);
      // 描述：在 desc 分区内自适应换行/缩字，绝不溢出卡片
      this.fitTextToZone(c.desc, o.desc, z.descMaxW, z.descMaxH, DESC_FONT.start, DESC_FONT.min);
      c.bg.setStrokeStyle(3, KIND_COLOR[o.kind] ?? 0x3d6c9e);
    }
    this.title.setVisible(true);
    this.overlay.setVisible(true);
    for (let i = 0; i < options.length; i++) {
      const c = this.cards[i];
      if (!c) continue;
      c.bg.setVisible(true); c.kind.setVisible(true);
      c.name.setVisible(true); c.desc.setVisible(true);
      // 淡入起点：整体 +24 下移，然后各自 tween 回自己的基准 y。
      // ⚠️ 不要用 `y: [a,b,c,d,e]` 数组语法——Phaser 会当作单目标关键帧路径，
      // 把所有对象 tween 到数组最后一项（v0.5.0 叠印 bug 的根因）。
      const off = 24;
      const base = c.base;
      type PaneObj = Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text;
      const entries: Array<[PaneObj, number]> = [
        [c.bg, base.cy], [c.border, base.cy],
        [c.kind, base.zone.kindY], [c.name, base.zone.nameY], [c.desc, base.zone.descY]
      ];
      this.setCardAlpha(c, 0);
      for (const [obj, finalY] of entries) {
        obj.setAlpha(0);
        obj.y = finalY + off;
        this.scene.tweens.add({
          targets: obj,
          alpha: 1,
          y: finalY,
          duration: 260,
          ease: 'Cubic.easeOut',
          delay: i * 70
        });
      }
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
