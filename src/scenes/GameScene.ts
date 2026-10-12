// 主游戏场景：把各系统串成核心循环
// 顺序：输入 → 玩家移动 → 敌人更新 → 武器开火/碰撞 → 掉落 → 刷怪 → 升级 → 结算
import Phaser from 'phaser';
import {
  WORLD_W, WORLD_H, GAME_W, GAME_H, PLAYER_BASE, GAME_DURATION, BOSS_TIME
} from '../config/balance.ts';
import { currentPhase, pickEnemy } from '../config/timeline.ts';
import { BUFF_POOL, PASSIVES, type PlayerStats } from '../config/upgrades.ts';
import { loadSave, writeSave, metaBonus } from '../core/save.ts';
import { sfx } from '../core/audio.ts';
import { vibrate } from '../core/vibration.ts';
import { Player } from '../game/player.ts';
import { EnemySystem, type Enemy } from '../game/enemySystem.ts';
import { WeaponSystem } from '../game/weaponSystem.ts';
import { DropSystem } from '../game/dropSystem.ts';
import { InputSystem } from '../game/inputSystem.ts';
import { LevelSystem, rollUpgradeOptions, type UpgradeOption } from '../game/levelUp.ts';
import { shakeForEvent } from '../game/feel.ts';
import { Hud } from '../ui/hud.ts';
import { LevelUpPanel } from '../ui/levelUpPanel.ts';
import { FloatingMenu } from '../ui/floatingMenu.ts';

export interface ResultData {
  win: boolean;
  time: number;
  kills: number;
  level: number;
  gold: number;
}

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private enemies!: EnemySystem;
  private weapons!: WeaponSystem;
  private drops!: DropSystem;
  private inputSys!: InputSystem;
  private hud!: Hud;
  private panel!: LevelUpPanel;
  private floatMenu!: FloatingMenu;
  private hurtFlash!: Phaser.GameObjects.Rectangle;
  private touchHint: Phaser.GameObjects.Text | null = null;
  private touchHintDone = false;
  private levelSys!: LevelSystem;
  private bg!: Phaser.GameObjects.TileSprite;

  private stats!: PlayerStats;
  private passives: Record<string, number> = {};   // 被动道具等级（进化钥匙）
  private elapsed = 0;
  private kills = 0;
  private gold = 0;
  private spawnTimer = 0;
  private bossSpawned = false;
  private isOver = false;
  private paused = false;
  private pauseOverlay: Phaser.GameObjects.Rectangle | null = null;
  private pauseLabel: Phaser.GameObjects.Text | null = null;

  constructor() { super('Game'); }

  create(): void {
    this.elapsed = 0;
    this.kills = 0;
    this.gold = 0;
    this.spawnTimer = 0;
    this.bossSpawned = false;
    this.isOver = false;
    this.touchHintDone = false;
    this.levelSys = new LevelSystem();
    this.passives = {};

    // 音效：浏览器自动播放策略要求先有用户手势，这里做一次性解锁
    const unlock = () => sfx.unlock();
    this.input.once('pointerdown', unlock);
    this.input.keyboard?.once('keydown', unlock);

    // 背景：屏幕大小的滚动瓦片（跟随相机偏移）
    // 注意：不要用 4000x4000 的世界尺寸 TileSprite —— 那会创建超大渲染纹理，
    // 实测在无头/低端设备上把帧率压到 11fps。屏幕大小 + setTilePosition 才是正解。
    this.bg = this.add.tileSprite(0, 0, GAME_W, GAME_H, 'bg_tile')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(0);

    // 世界边界（只画 4 条线，开销可忽略）
    const border = this.add.graphics().setDepth(1);
    border.lineStyle(6, 0x2a4a6b, 1);
    border.strokeRect(0, 0, WORLD_W, WORLD_H);

    // 玩家属性 = 基础 + 永久强化
    const save = loadSave();
    const bonus = metaBonus(save);
    this.stats = {
      maxHp: PLAYER_BASE.hp + bonus.maxHp,
      hp: PLAYER_BASE.hp + bonus.maxHp,
      speed: PLAYER_BASE.speed * bonus.speedMult,
      pickup: PLAYER_BASE.pickup + bonus.pickup,
      critChance: PLAYER_BASE.critChance + bonus.critChance,
      critMult: PLAYER_BASE.critMult,
      damageMult: PLAYER_BASE.damageMult * bonus.damageMult,
      xpMult: PLAYER_BASE.xpMult * bonus.xpMult
    };

    this.player = new Player(this, this.stats);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.12);
    this.cameras.main.setBackgroundColor('#0a1420');

    this.enemies = new EnemySystem(this);
    this.enemies.onKill = (e) => this.onEnemyKilled(e);

    this.weapons = new WeaponSystem(this);
    this.weapons.addWeapon('rifle');   // 默认武器

    this.drops = new DropSystem(this);
    this.drops.onPickup = (kind, value) => {
      if (kind === 'xp') {
        this.levelSys.addXp(value, this.stats.xpMult);
        sfx.pickup();
      } else {
        this.gold += value;
        sfx.coin();
      }
    };

    this.inputSys = new InputSystem(this);
    this.hud = new Hud(this);
    this.panel = new LevelUpPanel(this);
    // 悬浮菜单（可拖拽悬浮球 + 全屏面板）：继续/暂停、音效、震动、重开、返回菜单
    this.floatMenu = new FloatingMenu(this, {
      getPaused: () => this.paused,
      setPaused: (v: boolean, showOverlay = true) => this.setPaused(v, showOverlay),
      restart: () => this.scene.start('Game'),
      toMenu: () => this.scene.start('Menu')
    });

    // 暂停/恢复：HUD 按钮 + 键盘（P / Esc）。悬浮面板打开期间由面板自身接管暂停，避免抢切
    this.paused = false;
    this.hud.onPauseToggle = () => {
      if (this.floatMenu.isOpen) return;
      this.togglePause();
    };
    const kb = this.input.keyboard;
    if (kb) {
      kb.on('keydown-P', () => { if (this.floatMenu.isOpen) return; this.togglePause(); });
      kb.on('keydown-ESC', () => { if (this.floatMenu.isOpen) return; this.togglePause(); });
    }

    // 受击红晕：屏幕边缘闪一下，配合音效/震动给伤害反馈
    this.hurtFlash = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0xff2233, 0)
      .setDepth(160).setScrollFactor(0);

    // 暂停遮罩：覆盖世界并提示点击继续（只在暂停时显示）
    this.pauseOverlay = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x060b14, 0.66)
      .setDepth(170).setScrollFactor(0).setVisible(false).setInteractive();
    this.pauseLabel = this.add.text(GAME_W / 2, GAME_H / 2, '已暂停\n点击屏幕任意位置继续', {
      fontFamily: 'monospace', fontSize: '34px', color: '#e8f4ff', align: 'center', lineSpacing: 14
    }).setOrigin(0.5).setDepth(171).setScrollFactor(0).setVisible(false);
    this.pauseOverlay.on('pointerdown', () => this.togglePause());

    // 场景退出时解绑输入监听，避免重复绑定
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.inputSys.destroy();
      this.hud.destroy();
      this.panel.destroy();
      this.floatMenu.destroy();
      this.hurtFlash.destroy();
      this.pauseOverlay?.destroy();
      this.pauseLabel?.destroy();
      this.touchHint?.destroy();
      this.touchHint = null;
      this.touchHintDone = true;
    });

    this.showTouchHint();
  }

  update(_time: number, delta: number): void {
    if (this.isOver || this.paused) return;
    if (this.panel.visible) return;   // 升级面板打开时暂停世界

    // 帧率无关：单帧最大 50ms，防止切后台回来瞬移
    // 帧率无关：单帧最大 50ms（20fps）。
    // 故意不放到更大：子弹最快 1200px/s，0.05s 单帧位移 60px，
    // 与碰撞查询半径(70)匹配，绝不穿模。低于 20fps 时游戏时间会轻微膨胀——
    // 这是有意的降级（变慢比穿模好）。
    const dt = Math.min(delta / 1000, 0.05);
    this.elapsed += dt;

    // 背景滚动：用相机偏移驱动瓦片位置，视觉上等同无限地面
    const cam = this.cameras.main;
    this.bg.setTilePosition(cam.scrollX, cam.scrollY);

    this.inputSys.update();
    this.player.update(dt, this.inputSys.dirX, this.inputSys.dirY);
    this.enemies.update(dt, this.player.x, this.player.y);
    this.weapons.update(dt, this.player, this.enemies);

    this.collideEnemyPlayer();
    this.drops.update(dt, this.player);
    this.updateSpawner(dt);
    this.checkLevelUp();

    // 回收本帧被释放的对象
    this.enemies.pool.compact();
    this.drops.pool.compact();

    this.updateHud();
    this.checkEnd();
  }

  // 暂停/恢复：切状态、显示遮罩、清摇杆、更新按钮文案
  private togglePause(): void {
    this.setPaused(!this.paused);
  }

  // showOverlay=false：由悬浮面板当暂停 UI 时使用，不显示"点击继续"遮罩，避免两个全屏遮罩抢事件
  private setPaused(v: boolean, showOverlay = true): void {
    this.paused = v;
    this.hud.setPauseLabel(this.paused);
    this.pauseOverlay?.setVisible(this.paused && showOverlay);
    this.pauseLabel?.setVisible(this.paused && showOverlay);
    if (this.paused) this.inputSys.reset();   // 暂停时清掉摇杆，避免恢复时残留
  }

  private updateSpawner(dt: number): void {
    // Boss 到点登场（只一次）
    if (!this.bossSpawned && this.elapsed >= BOSS_TIME) {
      this.bossSpawned = true;
      this.spawnEnemy('boss');
      sfx.boss();
      vibrate([90, 60, 90]);
      const s = shakeForEvent('boss');
      this.cameras.main.shake(s.duration, s.intensity);
    }

    const phase = currentPhase(this.elapsed);
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = phase.intervalMs / 1000;
    if (this.enemies.count >= phase.maxAlive) return;

    for (let i = 0; i < phase.batch; i++) {
      this.spawnEnemy(pickEnemy(phase));
    }
  }

  // 屏幕外环形生成
  private spawnEnemy(id: string): void {
    const a = Math.random() * Math.PI * 2;
    const r = 760 + Math.random() * 220;
    let x = this.player.x + Math.cos(a) * r;
    let y = this.player.y + Math.sin(a) * r;
    x = Phaser.Math.Clamp(x, 30, WORLD_W - 30);
    y = Phaser.Math.Clamp(y, 30, WORLD_H - 30);
    this.enemies.spawn(id, x, y, this.elapsed);
  }

  private collideEnemyPlayer(): void {
    const live = this.enemies.live;
    for (let i = 0; i < live.length; i++) {
      const e = live[i];
      if (!e.active) continue;
      const rr = e.radius + this.player.radius;
      const dx = e.x - this.player.x;
      const dy = e.y - this.player.y;
      if (dx * dx + dy * dy <= rr * rr) {
        // 无敌帧在 Player 内部处理；只有"真的受伤"才需要视觉反馈
        if (this.player.takeDamage(e.damage, e.x, e.y)) {   // 传入命中来源：触发受击后仰/闪红
          sfx.hurt();
          vibrate([70, 40, 70]);
          const s = shakeForEvent('hurt');
          this.cameras.main.shake(s.duration, s.intensity);
          this.flashHurt();
        }
      }
    }
  }

  private onEnemyKilled(e: Enemy): void {
    this.kills++;
    sfx.kill();
    vibrate(25);
    this.drops.spawn(e.x, e.y, 'xp', e.xp);
    if (Math.random() < e.goldChance) this.drops.spawn(e.x, e.y, 'gold', 1);
    if (e.isBoss) this.finish(true);
  }

  private flashHurt(): void {
    if (this.hurtFlash.alpha >= 0.25) return;   // 连续受击时不要叠太厚
    this.hurtFlash.setAlpha(0.28);
    this.tweens.add({
      targets: this.hurtFlash,
      alpha: 0,
      duration: 300,
      onComplete: () => this.hurtFlash.setAlpha(0)
    });
  }

  // 首局触控提示：明确告知"按住屏幕任意位置拖动移动"；首次触摸或 5 秒后淡出
  private showTouchHint(): void {
    if (this.touchHintDone) return;
    this.touchHint = this.add.text(GAME_W / 2, GAME_H - 66, '按住屏幕任意位置拖动移动 · 自动攻击', {
      fontFamily: 'monospace', fontSize: '18px', color: '#cfeeff'
    }).setOrigin(0.5).setDepth(95).setScrollFactor(0).setAlpha(0.9);
    const dismiss = () => {
      if (this.touchHintDone) return;
      this.touchHintDone = true;
      this.input.off('pointerdown', dismiss);
      const h = this.touchHint;
      if (h) this.tweens.add({
        targets: h, alpha: 0, duration: 400,
        onComplete: () => h.destroy()
      });
      this.touchHint = null;
    };
    this.input.on('pointerdown', dismiss);
    this.time.delayedCall(5000, dismiss);
  }

  private checkLevelUp(): void {
    if (this.levelSys.pending <= 0) return;
    const owned = this.weapons.owned.map(w => ({ id: w.def.id, level: w.level, maxed: w.maxed }));
    const opts = rollUpgradeOptions(owned, this.passives);
    sfx.levelUp();
    vibrate([30, 50, 30]);
    this.inputSys.reset();   // 面板盖住世界：清掉残留的摇杆绘制
    this.panel.show(opts, (idx) => this.applyUpgrade(opts[idx]));
  }

  private applyUpgrade(opt: UpgradeOption): void {
    if (!opt) return;
    switch (opt.kind) {
      case 'new_weapon':
        this.weapons.addWeapon(opt.id);
        break;
      case 'weapon_level':
        this.weapons.upgradeWeapon(opt.id);
        break;
      case 'passive': {
        const p = PASSIVES[opt.id];
        if (p) {
          this.passives[opt.id] = (this.passives[opt.id] ?? 0) + 1;
          p.apply(this.stats);
        }
        break;
      }
      case 'evolution': {
        // 进化是质变：换掉武器形态，给一个专门的音效
        if (this.weapons.evolveWeapon(opt.id)) sfx.evolve();
        break;
      }
      case 'buff': {
        const b = BUFF_POOL.find(x => x.id === opt.id);
        if (b) b.apply(this.stats);
        break;
      }
    }
    this.levelSys.consumeLevelUp();
    this.panel.hide();
    // 一次涨多级时，继续弹下一个面板
    if (this.levelSys.pending > 0) this.checkLevelUp();
  }

  private updateHud(): void {
    let bossHp = 0;
    let bossMaxHp = 0;
    let bossName = '';
    const live = this.enemies.live;
    for (let i = 0; i < live.length; i++) {
      if (live[i].isBoss && live[i].active) {
        bossHp = live[i].hp;
        bossMaxHp = live[i].maxHp;
        bossName = live[i].def.name;
        break;
      }
    }
    this.hud.update({
      hp: this.stats.hp,
      maxHp: this.stats.maxHp,
      xpRatio: this.levelSys.ratio,
      xpCur: this.levelSys.xp,
      xpNeed: this.levelSys.need,
      level: this.levelSys.level,
      kills: this.kills,
      gold: this.gold,
      elapsed: this.elapsed,
      weapons: this.weapons.owned.map(w => ({ name: w.def.name, level: w.level, maxed: w.maxed })),
      bossHp, bossMaxHp, bossName
    });
  }

  private checkEnd(): void {
    if (this.elapsed >= GAME_DURATION) { this.finish(true); return; }
    if (!this.player.alive) this.finish(false);
  }

  private finish(win: boolean): void {
    if (this.isOver) return;
    this.isOver = true;
    if (win) sfx.win(); else sfx.lose();

    // 局内金币入档
    const save = loadSave();
    save.gold += this.gold;
    save.best.time = Math.max(save.best.time, this.elapsed);
    save.best.kills = Math.max(save.best.kills, this.kills);
    save.best.level = Math.max(save.best.level, this.levelSys.level);
    writeSave(save);

    const data: ResultData = {
      win,
      time: this.elapsed,
      kills: this.kills,
      level: this.levelSys.level,
      gold: this.gold
    };
    this.scene.start('Result', data);
  }
}