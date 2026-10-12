// HUD：血条、经验条、计时、等级/击杀/金币、Boss 血条
// 性能：Graphics 只在数值变化时重画；文本复用同一对象，不每帧新建
import Phaser from 'phaser';
import { GAME_W } from '../config/balance.ts';

export interface HudData {
  hp: number;
  maxHp: number;
  xpRatio: number;
  level: number;
  kills: number;
  gold: number;
  elapsed: number;
  bossHp: number;      // 0 表示不显示 Boss 血条
  bossMaxHp: number;
  bossName: string;
}

export class Hud {
  private hpBar: Phaser.GameObjects.Graphics;
  private xpBar: Phaser.GameObjects.Graphics;
  private bossBar: Phaser.GameObjects.Graphics;
  private timeText: Phaser.GameObjects.Text;
  private infoText: Phaser.GameObjects.Text;
  private hpText: Phaser.GameObjects.Text;
  private bossText: Phaser.GameObjects.Text;

  // 缓存上次绘制值，避免每帧重画
  private lastHp = -1;
  private lastMaxHp = -1;
  private lastXp = -1;
  private lastBossHp = -1;
  private lastBossMaxHp = -1;
  private lastTimeStr = '';
  private lastInfoStr = '';
  private lastHpStr = '';

  constructor(scene: Phaser.Scene) {
    this.hpBar = scene.add.graphics().setDepth(100).setScrollFactor(0);
    this.xpBar = scene.add.graphics().setDepth(100).setScrollFactor(0);
    this.bossBar = scene.add.graphics().setDepth(100).setScrollFactor(0);

    this.timeText = scene.add.text(GAME_W / 2, 22, '00:00', {
      fontFamily: 'monospace', fontSize: '26px', color: '#e8f4ff'
    }).setOrigin(0.5, 0).setDepth(101).setScrollFactor(0);

    this.infoText = scene.add.text(GAME_W - 20, 20, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#bcd8f0', align: 'right'
    }).setOrigin(1, 0).setDepth(101).setScrollFactor(0);

    this.hpText = scene.add.text(22, 40, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffd9d9'
    }).setDepth(101).setScrollFactor(0);

    this.bossText = scene.add.text(GAME_W / 2, 74, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffe9a8'
    }).setOrigin(0.5, 0).setDepth(101).setScrollFactor(0);
  }

  update(d: HudData): void {
    // 经验条（顶部通栏）
    if (d.xpRatio !== this.lastXp) {
      this.lastXp = d.xpRatio;
      this.xpBar.clear();
      this.xpBar.fillStyle(0x0d1b2a, 0.9);
      this.xpBar.fillRect(0, 0, GAME_W, 10);
      this.xpBar.fillStyle(0x4de8c2, 1);
      this.xpBar.fillRect(0, 0, GAME_W * Phaser.Math.Clamp(d.xpRatio, 0, 1), 10);
    }

    // 血条
    if (d.hp !== this.lastHp || d.maxHp !== this.lastMaxHp) {
      this.lastHp = d.hp;
      this.lastMaxHp = d.maxHp;
      const ratio = Phaser.Math.Clamp(d.hp / d.maxHp, 0, 1);
      this.hpBar.clear();
      this.hpBar.fillStyle(0x000000, 0.5);
      this.hpBar.fillRoundedRect(20, 18, 244, 18, 6);
      this.hpBar.fillStyle(ratio > 0.5 ? 0x5ce86a : ratio > 0.25 ? 0xffcc44 : 0xff5555, 1);
      this.hpBar.fillRoundedRect(22, 20, 240 * ratio, 14, 5);
    }
    const hpStr = `${Math.max(0, Math.ceil(d.hp))} / ${Math.ceil(d.maxHp)}`;
    if (hpStr !== this.lastHpStr) {
      this.lastHpStr = hpStr;
      this.hpText.setText(hpStr);
    }

    // 计时
    const mm = Math.floor(d.elapsed / 60);
    const ss = Math.floor(d.elapsed % 60);
    const t = `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
    if (t !== this.lastTimeStr) {
      this.lastTimeStr = t;
      this.timeText.setText(t);
    }

    // 等级/击杀/金币
    const info = `Lv.${d.level}\n击杀 ${d.kills}\n金币 ${d.gold}`;
    if (info !== this.lastInfoStr) {
      this.lastInfoStr = info;
      this.infoText.setText(info);
    }

    // Boss 血条
    if (d.bossHp !== this.lastBossHp || d.bossMaxHp !== this.lastBossMaxHp) {
      this.lastBossHp = d.bossHp;
      this.lastBossMaxHp = d.bossMaxHp;
      this.bossBar.clear();
      if (d.bossHp > 0) {
        const w = 620;
        const x = (GAME_W - w) / 2;
        const ratio = Phaser.Math.Clamp(d.bossHp / d.bossMaxHp, 0, 1);
        this.bossBar.fillStyle(0x000000, 0.55);
        this.bossBar.fillRoundedRect(x, 92, w, 16, 6);
        this.bossBar.fillStyle(0xff7a4d, 1);
        this.bossBar.fillRoundedRect(x + 2, 94, (w - 4) * ratio, 12, 5);
      }
      this.bossText.setText(d.bossHp > 0 ? d.bossName : '');
    }
  }

  destroy(): void {
    this.hpBar.destroy();
    this.xpBar.destroy();
    this.bossBar.destroy();
    this.timeText.destroy();
    this.infoText.destroy();
    this.hpText.destroy();
    this.bossText.destroy();
  }
}