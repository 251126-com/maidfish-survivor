// 结算场景：胜负 + 本局数据 + 返回/重开
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config/balance.ts';
import type { ResultData } from './GameScene.ts';

export class ResultScene extends Phaser.Scene {
  private result!: ResultData;

  constructor() { super('Result'); }

  init(data: ResultData): void {
    this.result = data;
  }

  create(): void {
    const r = this.result ?? { win: false, time: 0, kills: 0, level: 1, gold: 0 };

    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0a1420, 1);

    this.add.text(GAME_W / 2, 120, r.win ? '撑到最后！' : '被鱼群淹没了…', {
      fontFamily: 'monospace', fontSize: '48px',
      color: r.win ? '#4de8c2' : '#ff7a7a'
    }).setOrigin(0.5);

    const mm = Math.floor(r.time / 60);
    const ss = Math.floor(r.time % 60);
    const lines = [
      `存活时间：${mm} 分 ${ss} 秒`,
      `击杀数：${r.kills}`,
      `等级：Lv.${r.level}`,
      `本局金币：+${r.gold}`
    ];
    this.add.text(GAME_W / 2, 250, lines.join('\n'), {
      fontFamily: 'monospace', fontSize: '24px', color: '#cfe6ff',
      align: 'center', lineSpacing: 14
    }).setOrigin(0.5, 0);

    const mkBtn = (x: number, label: string, color: number, hover: number, cb: () => void) => {
      const b = this.add.rectangle(x, 520, 260, 70, color, 1)
        .setStrokeStyle(3, 0x9fe8ff).setInteractive({ useHandCursor: true });
      this.add.text(x, 520, label, {
        fontFamily: 'monospace', fontSize: '24px', color: '#ffffff'
      }).setOrigin(0.5);
      b.on('pointerover', () => b.setFillStyle(hover));
      b.on('pointerout', () => b.setFillStyle(color));
      b.on('pointerdown', cb);
    };

    mkBtn(GAME_W / 2 - 150, '再来一局', 0x2f7fd0, 0x3f9fe8, () => this.scene.start('Game'));
    mkBtn(GAME_W / 2 + 150, '返回主菜单', 0x3d5a78, 0x4d6a88, () => this.scene.start('Menu'));
  }
}