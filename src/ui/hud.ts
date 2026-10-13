// HUD：血条、经验条、XP数字、计时、等级/击杀/金币、武器状态、Boss 血条
// 功能按钮：音效开关、震动开关、暂停/恢复
// 性能：Graphics 只在数值变化时重画；文本复用同一对象，不每帧新建
import Phaser from 'phaser';
import { GAME_W } from '../config/balance.ts';
import { sfx } from '../core/audio.ts';
import { vibrateEnabled, setVibrate } from '../core/vibration.ts';

export interface HudWeaponInfo {
  name: string;
  level: number;
  maxed: boolean;
}

export interface HudData {
  hp: number;
  maxHp: number;
  armor: number;       // 饭盆护甲（0 = 无）
  armorMax: number;    // 护甲上限（30）
  xpRatio: number;
  xpCur: number;       // 当前经验数值
  xpNeed: number;      // 升下一级所需经验
  level: number;
  kills: number;
  gold: number;
  elapsed: number;
  weapons: HudWeaponInfo[];
  bossHp: number;      // 0 表示不显示 Boss 血条
  bossMaxHp: number;
  bossName: string;
}

export class Hud {
  private hpBar: Phaser.GameObjects.Graphics;
  private armorBar: Phaser.GameObjects.Graphics;
  private xpBar: Phaser.GameObjects.Graphics;
  private bossBar: Phaser.GameObjects.Graphics;
  private timeText: Phaser.GameObjects.Text;
  private infoText: Phaser.GameObjects.Text;
  private hpText: Phaser.GameObjects.Text;
  private armorText: Phaser.GameObjects.Text;
  private xpText: Phaser.GameObjects.Text;
  private weaponText: Phaser.GameObjects.Text;
  private bossText: Phaser.GameObjects.Text;
  private soundBtn: Phaser.GameObjects.Rectangle;
  private soundText: Phaser.GameObjects.Text;
  private vibBtn: Phaser.GameObjects.Rectangle;
  private vibText: Phaser.GameObjects.Text;
  private pauseBtn: Phaser.GameObjects.Rectangle;
  private pauseText: Phaser.GameObjects.Text;
  private bgBtn: Phaser.GameObjects.Rectangle;
  private bgText: Phaser.GameObjects.Text;

  // 暂停按钮回调：由 GameScene 注入，负责暂停/恢复逻辑
  onPauseToggle: (() => void) | null = null;
  // 场景切换回调：由 GameScene 注入，负责切到下一张授权背景
  onBgNext: (() => void) | null = null;

  // 缓存上次绘制值，避免每帧重画
  private lastHp = -1;
  private lastMaxHp = -1;
  private lastArmor = -1;
  private lastArmorMax = -1;
  private lastArmorStr = '';
  private lastXp = -1;
  private lastBossHp = -1;
  private lastBossMaxHp = -1;
  private lastTimeStr = '';
  private lastInfoStr = '';
  private lastHpStr = '';
  private lastXpStr = '';
  private lastWeaponStr = '';
  private lastPauseLabel = '';
  private lastBgLabel = '';

  constructor(scene: Phaser.Scene) {
    this.hpBar = scene.add.graphics().setDepth(100).setScrollFactor(0);
    this.armorBar = scene.add.graphics().setDepth(100).setScrollFactor(0);
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

    // 护甲文本：血条下方、武器状态上方；护甲为 0 时留空不占视觉
    this.armorText = scene.add.text(22, 52, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#cfe4ff'
    }).setDepth(101).setScrollFactor(0);

    // XP 数字：经验条(10px)下方，血条上方
    this.xpText = scene.add.text(22, 11, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#7fe8cc'
    }).setDepth(101).setScrollFactor(0);

    // 武器状态：左下角
    this.weaponText = scene.add.text(22, 64, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#bfe3ff', lineSpacing: 3
    }).setDepth(101).setScrollFactor(0);

    this.bossText = scene.add.text(GAME_W / 2, 74, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffe9a8'
    }).setOrigin(0.5, 0).setDepth(101).setScrollFactor(0);

    // 右列按钮：场景 / 暂停 / 音效 / 震动
    // 场景按钮显示当前授权背景名，点按切到下一张（桌面/手机横屏都避开摇杆触发区）
    this.bgBtn = this.makeBtn(scene, 86, '');
    this.bgBtn.on('pointerdown', () => {
      if (this.onBgNext) this.onBgNext();
    });
    this.bgText = this.makeBtnText(scene, 86, '');
    this.setBgName('');

    this.pauseBtn = this.makeBtn(scene, 126, '⏸ 暂停');
    this.pauseBtn.on('pointerdown', () => {
      if (this.onPauseToggle) this.onPauseToggle();
    });

    this.soundBtn = this.makeBtn(scene, 166, '');
    this.soundBtn.on('pointerdown', () => this.toggleSound());

    this.vibBtn = this.makeBtn(scene, 206, '');
    this.vibBtn.on('pointerdown', () => this.toggleVibration());

    this.pauseText = this.makeBtnText(scene, 126, '');
    this.soundText = this.makeBtnText(scene, 166, '');
    this.vibText = this.makeBtnText(scene, 206, '');

    this.refreshSoundLabel();
    this.refreshVibLabel();
    this.setPauseLabel(false);
  }

  private makeBtn(scene: Phaser.Scene, y: number, initial: string): Phaser.GameObjects.Rectangle {
    return scene.add.rectangle(GAME_W - 62, y, 84, 30, 0x101f33, 0.9)
      .setStrokeStyle(2, 0x3d6c9e)
      .setDepth(102)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
  }

  private makeBtnText(scene: Phaser.Scene, y: number, initial: string): Phaser.GameObjects.Text {
    return scene.add.text(GAME_W - 62, y, initial, {
      fontFamily: 'monospace', fontSize: '14px', color: '#dff2ff'
    }).setOrigin(0.5).setDepth(103).setScrollFactor(0);
  }

  private toggleSound(): void {
    sfx.setEnabled(!sfx.enabled);
    this.refreshSoundLabel();
  }

  private refreshSoundLabel(): void {
    this.soundText.setText(sfx.enabled ? '♪ 音效' : '✕ 音效');
    this.soundBtn.setStrokeStyle(2, sfx.enabled ? 0x3d6c9e : 0x7a3a3a);
  }

  private toggleVibration(): void {
    setVibrate(!vibrateEnabled());
    this.refreshVibLabel();
  }

  private refreshVibLabel(): void {
    this.vibText.setText(vibrateEnabled() ? '📳 震动' : '✕ 震动');
    this.vibBtn.setStrokeStyle(2, vibrateEnabled() ? 0x3d6c9e : 0x7a3a3a);
  }

  // 暂停态文字与描边（GameScene 每次切换时调用）
  setPauseLabel(paused: boolean): void {
    const label = paused ? '▶ 继续' : '⏸ 暂停';
    if (label === this.lastPauseLabel) return;
    this.lastPauseLabel = label;
    this.pauseText.setText(label);
    this.pauseBtn.setStrokeStyle(2, paused ? 0x4de8c2 : 0x3d6c9e);
  }

  // 场景按钮文案 = 当前授权背景名（切换后由 GameScene 调用刷新，暂停时也保持最新）
  setBgName(name: string): void {
    const label = name ? `🌌 ${name}` : '🌌 场景';
    if (label === this.lastBgLabel) return;
    this.lastBgLabel = label;
    this.bgText.setText(label);
    this.bgBtn.setStrokeStyle(2, name ? 0x6fc0ff : 0x3d6c9e);
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

    // XP 数字
    const xpStr = `经验 ${Math.floor(d.xpCur)} / ${Math.ceil(d.xpNeed)}`;
    if (xpStr !== this.lastXpStr) {
      this.lastXpStr = xpStr;
      this.xpText.setText(xpStr);
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

    // 护甲条：仅在护甲 > 0 时显示（蓝色），破甲后自动隐藏
    if (d.armor !== this.lastArmor || d.armorMax !== this.lastArmorMax) {
      this.lastArmor = d.armor;
      this.lastArmorMax = d.armorMax;
      this.armorBar.clear();
      if (d.armor > 0) {
        const ar = Phaser.Math.Clamp(d.armor / Math.max(1, d.armorMax), 0, 1);
        this.armorBar.fillStyle(0x000000, 0.5);
        this.armorBar.fillRoundedRect(20, 46, 244, 10, 5);
        this.armorBar.fillStyle(0x6fb8ff, 1);
        this.armorBar.fillRoundedRect(22, 48, 240 * ar, 6, 3);
      }
    }
    const armorStr = d.armor > 0 ? `🛡 护甲 ${Math.max(0, Math.ceil(d.armor))} / ${Math.ceil(d.armorMax)}` : '';
    if (armorStr !== this.lastArmorStr) {
      this.lastArmorStr = armorStr;
      this.armorText.setText(armorStr);
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

    // 武器状态
    const weaponStr = d.weapons.length === 0
      ? '武器：无'
      : d.weapons.map(w => `${w.maxed ? '★' : ''}${w.name} Lv.${w.level}`).join('\n');
    if (weaponStr !== this.lastWeaponStr) {
      this.lastWeaponStr = weaponStr;
      this.weaponText.setText(weaponStr);
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
    this.armorBar.destroy();
    this.xpBar.destroy();
    this.bossBar.destroy();
    this.timeText.destroy();
    this.infoText.destroy();
    this.hpText.destroy();
    this.armorText.destroy();
    this.xpText.destroy();
    this.weaponText.destroy();
    this.bossText.destroy();
    this.soundBtn.destroy();
    this.soundText.destroy();
    this.vibBtn.destroy();
    this.vibText.destroy();
    this.pauseBtn.destroy();
    this.pauseText.destroy();
    this.bgBtn.destroy();
    this.bgText.destroy();
  }
}
