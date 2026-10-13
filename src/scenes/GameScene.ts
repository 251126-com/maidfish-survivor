// 主游戏场景：把各系统串成核心循环
// 顺序：输入 → 玩家移动 → 敌人更新 → 武器开火/碰撞 → 掉落 → 刷怪 → 升级 → 结算
import Phaser from 'phaser';
import {
  WORLD_W, WORLD_H, GAME_W, GAME_H, PLAYER_BASE, GAME_DURATION, BOSS_TIME, BOSS_WARN_TIME,
  RICE_HEAL, ARMOR_MAX
} from '../config/balance.ts';
import { currentPhase, pickEnemy, WAVE_EVENTS } from '../config/timeline.ts';
import { BG_ORDER, randomStartIndex } from '../config/background.ts';
import { BUFF_POOL, PASSIVES, type PlayerStats } from '../config/upgrades.ts';
import { loadSave, writeSave, metaBonus } from '../core/save.ts';
import { sfx } from '../core/audio.ts';
import { vibrate } from '../core/vibration.ts';
import { Player } from '../game/player.ts';
import { EnemySystem, type Enemy } from '../game/enemySystem.ts';
import { WeaponSystem } from '../game/weaponSystem.ts';
import { EnemyBulletSystem, bulletHitsPlayer } from '../game/enemyBullets.ts';
import { BossBrain, type BossEvent, type SkillParams } from '../game/bossBrain.ts';
import { DropSystem, type LootKind } from '../game/dropSystem.ts';
import { rollSpecialDrop } from '../game/collectibles.ts';
import { createFinishTimer, RESULT_DELAY_MS, type FinishTimer } from '../game/finishTimer.ts';
import { InputSystem } from '../game/inputSystem.ts';
import { BackgroundLayer } from '../game/backgroundLayer.ts';
import { LevelSystem, rollUpgradeOptions, type UpgradeOption } from '../game/levelUp.ts';
import { shakeForEvent } from '../game/feel.ts';
import { DeathFx } from '../game/deathFx.ts';
import { KillStreak } from '../game/killStreak.ts';
import { hitStopSpec } from '../game/hitStop.ts';
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
  /** 固定屏幕背景层：按周期切换四张授权背景 */
  private bgLayer!: BackgroundLayer;
  /** 本局起始背景下标（菜单选关或随机） */
  private bgStartIndex = 0;
  private bgToast: Phaser.GameObjects.Text | null = null;

  private stats!: PlayerStats;
  private passives: Record<string, number> = {};   // 被动道具等级（进化钥匙）
  private elapsed = 0;
  private kills = 0;
  private gold = 0;
  private spawnTimer = 0;
  private bossSpawned = false;
  private bossWarned = false;      // v0.10.0 Boss 登场前预警已播
  private waveIdx = 0;             // v0.10.0 开场波次事件指针
  private isOver = false;
  private finishTimer: FinishTimer | null = null;
  private resultData: ResultData | null = null;
  // v0.9.0 Boss 战
  private bossBrain: BossBrain | null = null;
  private bossEnemy: Enemy | null = null;
  private enemyBullets: EnemyBulletSystem | null = null;
  private bossTeleG: Phaser.GameObjects.Graphics | null = null;
  private bossBannerText: Phaser.GameObjects.Text | null = null;
  private waveBannerText: Phaser.GameObjects.Text | null = null;
  // v0.10.0 打击感：死亡粒子 / 连杀 / 顿帧
  private deathFx!: DeathFx;
  private streak!: KillStreak;
  private hitStopScale = 1;      // v0.10.0 顿帧当前时间缩放（大事件短暂放慢）
  private hitStopUntil = 0;      // v0.10.0 顿帧结束墙钟时间戳（真实时间，防卡死）
  private paused = false;
  private pauseOverlay: Phaser.GameObjects.Rectangle | null = null;
  private pauseLabel: Phaser.GameObjects.Text | null = null;

  constructor() { super('Game'); }

  init(data: { bgStart?: number }): void {
    // 起始背景：菜单选关(bgStart)优先，否则正常玩法随机轮换
    let start = -1;
    if (data && typeof data.bgStart === 'number') start = data.bgStart;
    if (start < 0 || start >= BG_ORDER.length) start = randomStartIndex();
    this.bgStartIndex = start;
  }

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

    // 背景：四张授权背景按周期切换的固定屏幕层（scrollFactor 0）。
    // 内部自带统一暗色遮罩（depth 2），压低背景亮度保证角色/弹幕/敌人/HUD 可读。
    this.bgLayer = new BackgroundLayer(this, this.bgStartIndex);
    this.bgLayer.onSwitch = (key, name) => {
      this.showBgToast(name);
      this.hud?.setBgName(name);
    };
    this.syncBgState();

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

    // v0.9.0 Boss 弹幕池 + 预警绘制层（深度高于敌人、低于弹幕/角色特效）
    this.enemyBullets = new EnemyBulletSystem(this);
    this.bossTeleG = this.add.graphics().setDepth(15);

    this.weapons = new WeaponSystem(this);
    this.weapons.addWeapon('rifle');   // 默认武器
    // v0.10.0 命中特效：暴击火花（克制 3 粒）
    this.weapons.onHitFx = (e, crit) => {
      if (crit) this.deathFx?.spark(e.x, e.y, 3);
    };

    this.drops = new DropSystem(this);
    // v0.10.0 打击感系统：击杀爆散粒子 + 连杀计数
    this.deathFx = new DeathFx(this);
    this.streak = new KillStreak(3.0);
    this.drops.onPickup = (kind, value) => {
      if (kind === 'xp') {
        this.levelSys.addXp(value, this.stats.xpMult);
        sfx.pickup();
      } else if (kind === 'gold') {
        this.gold += value;
        sfx.coin();
      } else if (kind === 'rice') {
        // 大白饭：回血并钳制到最大 HP，给出实际回复量反馈
        const healed = this.player.heal(RICE_HEAL);
        sfx.pickup();
        this.showPickupFeedback(`+${Math.round(healed)} 生命`, 0x7fe8a0);
      } else if (kind === 'bowl') {
        // 饭盆：获得/刷新 30 护甲；已满则提示（不叠加超上限）
        const st = this.player.gainArmor();
        sfx.pickup();
        this.showPickupFeedback(st === 'full' ? '护甲已满' : '护甲 +30', 0x6fb8ff);
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
      toMenu: () => this.scene.start('Menu'),
      nextBg: () => {
        // 悬浮面板暂停态换景：直接切，交叉淡入淡出 tween 照常播放
        this.bgLayer.next(this.elapsed);
        this.hud?.setBgName(this.bgLayer.activeName);
      }
    });
    this.hud.setBgName(this.bgLayer.activeName);

    // 暂停/恢复：HUD 按钮 + 键盘（P / Esc）。悬浮面板打开期间由面板自身接管暂停，避免抢切
    this.paused = false;
    this.hud.onBgNext = () => {
      // 悬浮面板打开 / 暂停遮罩 / 升级面板期间不响应，避免与遮罩交互抢切
      if (this.floatMenu.isOpen || this.paused || this.panel.visible) return;
      this.bgLayer.next(this.elapsed);
      this.hud.setBgName(this.bgLayer.activeName);
    };
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
      this.finishTimer?.reset();   // v0.9.1: 幂等清理墙钟计时器
      this.finishTimer = null;
      this.resultData = null;
      this.hitStopScale = 1;       // v0.10.0: 顿帧状态复位，重开/退出不留缩放
      this.hitStopUntil = 0;
      if (this.enemyBullets) this.enemyBullets.pool.releaseAll();
      this.player.destroy();   // v0.9.1：幂等销毁玩家 display 对象，退出/重开不泄漏
      this.bossTeleG?.destroy();
      this.bossBannerText?.destroy();
      this.bgLayer.destroy();
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
    // v0.9.1: 胜负展示墙钟计时器——isOver 也每帧进来 tick；暂停/升级面板打开时冻结，不提前进结算
    if (this.finishTimer && this.finishTimer.tick(performance.now(), this.paused || this.panel.visible) && this.resultData) {
      this.scene.start('Result', this.resultData);
      this.finishTimer = null;
      this.resultData = null;
    }
    if (this.isOver || this.paused) return;
    if (this.panel.visible) return;   // 升级面板打开时暂停世界

    // 帧率无关：单帧最大 50ms，防止切后台回来瞬移
    // 帧率无关：单帧最大 50ms（20fps）。
    // 故意不放到更大：子弹最快 1200px/s，0.05s 单帧位移 60px，
    // 与碰撞查询半径(70)匹配，绝不穿模。低于 20fps 时游戏时间会轻微膨胀——
    // 这是有意的降级（变慢比穿模好）。
    const rawDt = Math.min(delta / 1000, 0.05);
    const dt = rawDt * this.hitStopScale;   // v0.10.0 顿帧：大事件短暂放慢游戏时间
    this.elapsed += dt;

    // 背景：跨过切换点就交叉淡入淡出下一张授权背景
    this.bgLayer.update(this.elapsed);
    this.syncBgState();

    this.inputSys.update();
    this.player.update(dt, this.inputSys.dirX, this.inputSys.dirY);
    this.enemies.update(dt, this.player.x, this.player.y);
    this.weapons.update(dt, this.player, this.enemies);

    // 最近敌人瞄准（持枪转向用，无敌人时枪朝默认方向）
    const aim = this.nearestEnemy();
    if (aim) this.player.setAimTarget(aim.x, aim.y);
    else this.player.setAimTarget(null, null);

    // Boss 战：预警/出招/弹幕
    this.updateBoss(dt);
    if (this.enemyBullets) {
      this.enemyBullets.update(dt);
      this.collideEnemyBullets();
    }

    this.collideEnemyPlayer();
    this.drops.update(dt, this.player);
    // v0.10.0：连杀窗口衰减 + 击杀粒子更新（纯对象池，量少）
    this.streak.tick(dt);
    this.deathFx.update(dt);
    this.updateSpawner(dt);
    this.checkLevelUp();

    // 回收本帧被释放的对象
    this.enemies.pool.compact();
    this.drops.pool.compact();

    this.updateHud();
    this.checkEnd();
  }

  // 同步全局可观测背景状态（e2e/线上校验用）
  private syncBgState(): void {
    const w = window as unknown as { __BG_STATE: { version: string; activeIndex: number; activeKey: string; activeName: string } };
    if (!w.__BG_STATE) return;
    w.__BG_STATE.activeIndex = this.bgLayer.activeIndex;
    w.__BG_STATE.activeKey = this.bgLayer.activeKey;
    w.__BG_STATE.activeName = this.bgLayer.activeName;
  }

  // 背景切换提示：屏幕上方短暂弹出「进入 XX」并淡出
  private showBgToast(name: string): void {
    if (this.bgToast) this.bgToast.destroy();
    this.bgToast = this.add.text(GAME_W / 2, 96, `进入 · ${name}`, {
      fontFamily: 'monospace', fontSize: '22px', color: '#9fe8ff'
    }).setOrigin(0.5).setDepth(96).setScrollFactor(0).setAlpha(0);
    this.tweens.add({
      targets: this.bgToast,
      alpha: 1,
      y: 84,
      duration: 220,
      ease: 'Cubic.easeOut',
      yoyo: true,
      hold: 900,
      onComplete: () => { this.bgToast?.destroy(); this.bgToast = null; }
    });
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
    // Boss 登场前 BOSS_WARN_TIME 秒：预警横幅（只一次），给玩家提前走位/清小怪的时间
    if (!this.bossSpawned && !this.bossWarned && this.elapsed >= BOSS_TIME - BOSS_WARN_TIME) {
      this.bossWarned = true;
      this.showBossBanner('⚠ 蓝色大肥鱼王 即将来袭！', '#ff9a4d');
    }
    // Boss 到点登场（只一次）
    if (!this.bossSpawned && this.elapsed >= BOSS_TIME) {
      this.bossSpawned = true;
      const be = this.spawnEnemy('boss');
      if (be) {
        this.bossEnemy = be;
        this.bossBrain = new BossBrain(be.x, be.y, be.hp / be.maxHp);
      }
      sfx.boss();
      vibrate([90, 60, 90]);
      const s = shakeForEvent('boss');
      this.cameras.main.shake(s.duration, s.intensity);
      this.showBossBanner('蓝色大肥鱼王 登场！', '#ffd447');
    }

    // v0.10.0 开场波次：时间轴小浪潮（更近半径进屏快）+ 横幅节奏反馈
    while (this.waveIdx < WAVE_EVENTS.length && this.elapsed >= WAVE_EVENTS[this.waveIdx].atSec) {
      const ev = WAVE_EVENTS[this.waveIdx];
      this.waveIdx++;
      for (const [id, n] of ev.burst) {
        for (let i = 0; i < n; i++) this.spawnEnemyAt(id, ev.radius);
      }
      this.showWaveBanner(ev.label);
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

  // 屏幕外环形生成；返回生成的敌人（Boss 需要引用）
  private spawnEnemy(id: string): Enemy | null {
    const a = Math.random() * Math.PI * 2;
    const r = 760 + Math.random() * 220;
    let x = this.player.x + Math.cos(a) * r;
    let y = this.player.y + Math.sin(a) * r;
    x = Phaser.Math.Clamp(x, 30, WORLD_W - 30);
    y = Phaser.Math.Clamp(y, 30, WORLD_H - 30);
    return this.enemies.spawn(id, x, y, this.elapsed);
  }

  // 指定半径环生成（波次事件用，比常规 760~980 更近，保证 10s 内进屏）
  private spawnEnemyAt(id: string, radius: number): Enemy | null {
    const a = Math.random() * Math.PI * 2;
    const r = radius + Math.random() * 60;
    let x = this.player.x + Math.cos(a) * r;
    let y = this.player.y + Math.sin(a) * r;
    x = Phaser.Math.Clamp(x, 30, WORLD_W - 30);
    y = Phaser.Math.Clamp(y, 30, WORLD_H - 30);
    return this.enemies.spawn(id, x, y, this.elapsed);
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

  // —— v0.9.0 Boss 战表现/逻辑 ——

  // 最近敌人（供持枪瞄准；含 Boss），无则 null
  private nearestEnemy(): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    const live = this.enemies.live;
    for (let i = 0; i < live.length; i++) {
      const e = live[i];
      if (!e.active) continue;
      const d = (e.x - this.player.x) ** 2 + (e.y - this.player.y) ** 2;
      if (d < bd) { bd = d; best = { x: e.x, y: e.y }; }
    }
    return best;
  }

  // Boss 脑推进：预警表现/出招/阶段变化/专属血条状态
  private updateBoss(dt: number): void {
    const brain = this.bossBrain;
    const be = this.bossEnemy;
    if (!brain || !be || !be.active) { this.bossTeleG?.clear(); return; }

    // 非冲刺时 Boss 位置跟随敌人系统（追踪玩家+分离力）；冲刺时由脑驱动
    if (!brain.dashing) {
      brain.x = be.x;
      brain.y = be.y;
    }
    const hpRatio = Phaser.Math.Clamp(be.hp / be.maxHp, 0, 1);
    // v0.9.1：dash 预警期间冻结 Boss 位置在预警起点（否则敌人追踪漂移 → 预警线与实际路径错位）
    if (brain.state === 'telegraph' && brain.currentSkill === 'dash') {
      const t = brain.telegraphParams;
      if (t && t.dashFromX !== undefined && t.dashFromY !== undefined) {
        be.x = t.dashFromX;
        be.y = t.dashFromY;
        be.sprite.setPosition(be.x, be.y);
      }
    }
    const events = brain.step(dt, hpRatio, this.player.x, this.player.y);
    // 冲刺时把脑内位移写回敌人
    if (brain.dashing) {
      be.x = Phaser.Math.Clamp(brain.x, 0, WORLD_W);
      be.y = Phaser.Math.Clamp(brain.y, 0, WORLD_H);
      brain.x = be.x; brain.y = be.y;
      be.sprite.setPosition(be.x, be.y);
    }
    for (const ev of events) this.handleBossEvent(ev, brain, be);

    // 预警表现（每个 telegraph/act 帧绘制，暂停/升级时自然冻结）
    this.drawBossTelegraph(brain);
    // 预警中 → 角色警觉表情
    this.player.setAlert(brain.inTelegraph || brain.state === 'roar' || brain.inAct);
  }

  private handleBossEvent(ev: BossEvent, brain: BossBrain, be: Enemy): void {
    switch (ev.type) {
      case 'phase-change':
        this.showBossBanner(`Boss 狂暴 · 阶段 ${ev.phase + 1}/3`, '#ff6b5a');
        this.cameras.main.shake(240, 0.008);
        vibrate([60, 40, 60]);
        break;
      case 'roar-start':
        // 咆哮期间霸体脉冲由 drawBossTelegraph 画（红圈呼吸）
        break;
      case 'skill-cancel':
        // v0.9.1：跨阶段打断技能 → 清掉预警（不残留误导红圈/直线），并给明确反馈；
        // 不触发 act-end，因此不补无预警爆炸。
        this.bossTeleG?.clear();
        this.showCancelFeedback(be.x, be.y);
        break;
      case 'telegraph-start': {
        const names: Record<string, string> = { dash: '预警：冲刺！', spread: '预警：扇弹！', circle: '预警：红圈！' };
        if (ev.skill) this.showBossBanner(names[ev.skill] ?? '', '#ffd447');
        break;
      }
      case 'act-start': {
        const p = ev.params;
        if (!p) break;
        if (ev.skill === 'spread' && p.fanAngle !== undefined) {
          // 扇形弹幕：phase 决定弹数（brain 已算好）
          const count = p.fanCount ?? 7;
          const half = p.fanHalf ?? 0.42;
          const speed = 250 + brain.phase * 40;
          for (let i = 0; i < count; i++) {
            const off = -half + (2 * half * i) / Math.max(1, count - 1);
            this.enemyBullets?.spawn(be.x, be.y, p.fanAngle + off, speed, 12 + brain.phase * 4, 7, 3.4);
          }
          sfx.boss();  // 弹幕发出提示音
        }
        break;
      }
      case 'act-end': {
        const p = ev.params;
        if (ev.skill === 'circle' && p?.circles) {
          for (const c of p.circles) this.explodeCircle(c.x, c.y, c.r, brain.phase);
        }
        this.bossTeleG?.clear();
        break;
      }
    }
  }

  // 红圈炸裂：范围内玩家受伤 + 爆发粒子
  private explodeCircle(x: number, y: number, r: number, phase: number): void {
    const dmg = 20 + phase * 10;
    const dx = this.player.x - x;
    const dy = this.player.y - y;
    if (Math.hypot(dx, dy) < r + this.player.radius) {
      if (this.player.takeDamage(dmg, x, y)) {
        sfx.hurt();
        vibrate([70, 40, 70]);
        this.flashHurt();
      }
    }
    for (let i = 0; i < 16; i++) {
      const p = this.add.circle(x, y, 3 + Math.random() * 3, 0xff7a4d, 1);
      p.setDepth(25);
      const a = Math.random() * Math.PI * 2;
      const sp = 100 + Math.random() * 160;
      this.tweens.add({
        targets: p, x: x + Math.cos(a) * sp, y: y + Math.sin(a) * sp,
        alpha: 0, scale: 0.2, duration: 380 + Math.random() * 180, ease: 'Cubic.easeOut',
        onComplete: () => p.destroy()
      });
    }
  }

  // 绘制预警：dash 直线 / spread 聚能 / circle 红圈
  private drawBossTelegraph(brain: BossBrain): void {
    const g = this.bossTeleG;
    if (!g) return;
    g.clear();
    // Boss 独立相态光晕（程序化）：三阶段变色 蓝→橙→红，咆哮时脉冲放大
    const auraColor = brain.phase >= 2 ? 0xff6b5a : brain.phase === 1 ? 0xffb04d : 0x4a9fe8;
    const auraR = 92 + (brain.state === 'roar' ? Math.sin(this.elapsed * 14) * 14 : 0);
    g.fillStyle(auraColor, 0.10);
    g.fillCircle(brain.x, brain.y, auraR);
    g.lineStyle(3, auraColor, 0.35);
    g.strokeCircle(brain.x, brain.y, auraR + 10);
    const p = brain.telegraphParams;
    const skill = brain.currentSkill;
    if (brain.state === 'telegraph') {
      if (skill === 'dash' && p && p.dashDirX !== undefined && p.dashDirY !== undefined
          && p.dashFromX !== undefined && p.dashFromY !== undefined) {
        const len = 1000;
        g.lineStyle(6, 0xff4a3a, 0.65);
        g.beginPath();
        g.moveTo(p.dashFromX, p.dashFromY);
        g.lineTo(p.dashFromX + p.dashDirX * len, p.dashFromY + p.dashDirY * len);
        g.strokePath();
        g.lineStyle(3, 0xffd9d0, 0.85);
        g.beginPath();
        g.moveTo(p.dashFromX, p.dashFromY);
        g.lineTo(p.dashFromX + p.dashDirX * len, p.dashFromY + p.dashDirY * len);
        g.strokePath();
      } else if (skill === 'spread') {
        // 聚能环：从大收缩到小
        const rr = 90 - brain.telegraphProg * 50;
        g.lineStyle(5, 0xffd447, 0.7);
        g.strokeCircle(brain.x, brain.y, Math.max(12, rr));
        g.fillStyle(0xffd447, 0.12);
        g.fillCircle(brain.x, brain.y, Math.max(12, rr));
      } else if (skill === 'circle') {
        const prog = brain.telegraphProg;
        for (const c of brain.warningCircles) {
          const r = c.r * (0.35 + 0.65 * prog);
          g.lineStyle(5, 0xff4a3a, 0.8);
          g.strokeCircle(c.x, c.y, r);
          g.fillStyle(0xff4a3a, 0.16 * prog);
          g.fillCircle(c.x, c.y, r);
        }
      }
    } else if (brain.state === 'act' && skill === 'circle') {
      // act 阶段圈保持满半径，等 act-end 炸裂
      for (const c of brain.warningCircles) {
        g.lineStyle(5, 0xff4a3a, 0.9);
        g.strokeCircle(c.x, c.y, c.r);
        g.fillStyle(0xff4a3a, 0.2);
        g.fillCircle(c.x, c.y, c.r);
      }
    } else if (brain.state === 'roar') {
      // 咆哮呼吸圈（霸体提示）
      const pulse = 70 + Math.sin(this.elapsed * 14) * 12;
      g.lineStyle(5, 0xff7a4d, 0.5);
      g.strokeCircle(brain.x, brain.y, pulse);
    }
  }

  // Boss 弹幕与玩家碰撞（v0.9.1：改用 bulletHitsPlayer → active 守卫，死弹不伤害；命中一次即回收）
  private collideEnemyBullets(): void {
    const bs = this.enemyBullets?.live;
    if (!bs) return;
    const px = this.player.x;
    const py = this.player.y;
    const pr = this.player.radius;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!bulletHitsPlayer(b, px, py, pr)) continue;
      if (this.player.takeDamage(b.damage, b.x, b.y)) {
        sfx.hurt();
        vibrate([60, 40, 60]);
        this.flashHurt();
      }
      this.enemyBullets!.pool.release(b);
    }
  }

  // 技能被打断的明确反馈：Boss 头顶浮出文字并淡出
  private showCancelFeedback(x: number, y: number): void {
    const t = this.add.text(x, y - 130, '☠ 技能被打断！', {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffd447',
      stroke: '#062033', strokeThickness: 4
    }).setOrigin(0.5).setDepth(96);
    this.tweens.add({
      targets: t, y: t.y - 40, alpha: 0, duration: 900, ease: 'Cubic.easeOut',
      onComplete: () => t.destroy()
    });
  }

  // 波次/连杀横幅（独立于 Boss 横幅位，避免互相顶掉）
  private showWaveBanner(text: string, color = '#9fe8ff'): void {
    if (this.waveBannerText) this.waveBannerText.destroy();
    this.waveBannerText = this.add.text(GAME_W / 2, 196, text, {
      fontFamily: 'monospace', fontSize: '26px', color,
      stroke: '#062033', strokeThickness: 5
    }).setOrigin(0.5).setDepth(174).setScrollFactor(0).setAlpha(0);
    this.tweens.add({
      targets: this.waveBannerText,
      alpha: 1, y: 186, duration: 180, ease: 'Cubic.easeOut',
      yoyo: true, hold: 800,
      onComplete: () => { this.waveBannerText?.destroy(); this.waveBannerText = null; }
    });
  }

  // v0.10.0 顿帧：大事件(连杀里程碑/Boss击破)短暂放慢游戏时间制造"定格"手感；
  // 用真实墙钟 setTimeout 恢复，不受游戏内时间缩放影响，绝不卡死。
  private doHitStop(kind: 'milestone' | 'boss'): void {
    const now = performance.now();
    if (now < this.hitStopUntil) return;   // 已在顿帧中，不叠加
    const spec = hitStopSpec(kind);
    this.hitStopUntil = now + spec.ms;
    this.hitStopScale = spec.scale;
    setTimeout(() => { this.hitStopScale = 1; }, spec.ms);
  }

  // 屏幕上方红色横幅（Boss 阶段/预警/击破）
  private showBossBanner(text: string, color: string): void {
    if (this.bossBannerText) this.bossBannerText.destroy();
    this.bossBannerText = this.add.text(GAME_W / 2, 148, text, {
      fontFamily: 'monospace', fontSize: '30px', color,
      stroke: '#062033', strokeThickness: 6
    }).setOrigin(0.5).setDepth(175).setScrollFactor(0).setAlpha(0);
    this.tweens.add({
      targets: this.bossBannerText,
      alpha: 1, y: 138, duration: 200, ease: 'Cubic.easeOut',
      yoyo: true, hold: 950,
      onComplete: () => { this.bossBannerText?.destroy(); this.bossBannerText = null; }
    });
  }

  private onEnemyKilled(e: Enemy): void {
    this.kills++;
    sfx.kill();
    vibrate(25);
    // v0.10.0 击杀爆散：按敌人类型(鱼5/疾行5/肥鱼10/Boss30)池化粒子，克制数量保帧率
    this.deathFx.burst(e.x, e.y, e.def.id);
    // v0.10.0 连杀：3s 窗口累计，每 5 连杀一次里程碑（横幅+顿帧+轻震），鼓励连续击杀
    const streakCount = this.streak.add();
    if (this.streak.isMilestone(5)) {
      const color = streakCount >= 20 ? '#ffd447' : streakCount >= 10 ? '#8ef0b8' : '#9fe8ff';
      this.showWaveBanner(`${streakCount} 连杀！`, color);
      this.doHitStop('milestone');
      vibrate([40, 60, 40]);
      this.cameras.main.shake(120, 0.006);
    }
    this.drops.spawn(e.x, e.y, 'xp', e.xp);
    if (Math.random() < e.goldChance) this.drops.spawn(e.x, e.y, 'gold', 1);
    // 特殊掉落：极低概率的大白饭/饭盆（默认 1.5% / 0.35%，见 balance.ts）
    const special = rollSpecialDrop(this.dropRng());
    if (special === 'rice') this.drops.spawn(e.x, e.y, 'rice', RICE_HEAL);
    else if (special === 'bowl') this.drops.spawn(e.x, e.y, 'bowl', ARMOR_MAX);
    if (e.isBoss) this.onBossKilled();
  }

  // Boss 死亡：专属死亡反馈（爆炸粒子/震屏/大额奖励掉落）后判定胜利
  private onBossKilled(): void {
    if (!this.bossEnemy) return;
    const bx = this.bossEnemy.x;
    const by = this.bossEnemy.y;
    for (let ring = 0; ring < 3; ring++) {
      for (let i = 0; i < 18; i++) {
        const p = this.add.circle(bx, by, 4 + ring * 2, ring === 2 ? 0x4de8c2 : 0xff7a4d, 1);
        p.setDepth(25);
        const a = (i / 18) * Math.PI * 2;
        const sp = 180 + ring * 90 + Math.random() * 110;
        this.tweens.add({
          targets: p, x: bx + Math.cos(a) * sp, y: by + Math.sin(a) * sp,
          alpha: 0, scale: 0.1, duration: 520 + ring * 140, ease: 'Cubic.easeOut',
          onComplete: () => p.destroy()
        });
      }
    }
    for (let i = 0; i < 14; i++) this.drops.spawn(bx + (Math.random() - 0.5) * 80, by + (Math.random() - 0.5) * 80, 'xp', 25);
    for (let i = 0; i < 8; i++) this.drops.spawn(bx + (Math.random() - 0.5) * 80, by + (Math.random() - 0.5) * 80, 'gold', 1);
    this.drops.spawn(bx, by, 'rice', RICE_HEAL);
    this.drops.spawn(bx, by, 'bowl', ARMOR_MAX);
    this.cameras.main.shake(320, 0.014);
    vibrate([120, 60, 120, 60]);
    sfx.evolve();
    this.doHitStop('boss');
    this.showBossBanner('Boss 击破！', '#4de8c2');
    this.bossTeleG?.clear();
    this.bossBrain = null;
    this.bossEnemy = null;
    this.player.setAlert(false);
    this.finish(true);
  }

  // 掉落随机源：E2E 可注入 window.__DROP_RNG 做受控掉落验证；默认 Math.random
  private dropRng(): () => number {
    const w = window as unknown as { __DROP_RNG?: () => number };
    return w.__DROP_RNG ?? Math.random;
  }

  // 拾取反馈浮动文本：玩家头顶升起、淡出、自动销毁
  // v0.9.1 修复：世界坐标 + scrollFactor(0) 会在相机滚动后出现在屏外/错位 → 改世界跟随(1)，与伤害数字一致
  private showPickupFeedback(text: string, color: number): void {
    const t = this.add.text(this.player.x, this.player.y - 68, text, {
      fontFamily: 'monospace', fontSize: '16px', color: `#${color.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5).setDepth(40).setScrollFactor(1);
    this.tweens.add({
      targets: t,
      y: t.y - 34,
      alpha: 0,
      duration: 950,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy()
    });
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
    // E2E 调试钩子：__UPGRADE_FORCE_ID 指定某张卡必须出现在面板（验收"大白饭"升级卡用）。
    // 未设置时行为与线上完全一致（rollUpgradeOptions 默认 Math.random 洗牌）。
    const force = (window as unknown as { __UPGRADE_FORCE_ID?: string }).__UPGRADE_FORCE_ID;
    let opts = rollUpgradeOptions(owned, this.passives);
    if (force && !opts.some(o => o.id === force)) {
      const b = BUFF_POOL.find(x => x.id === force);
      if (b) {
        const forced: UpgradeOption = { kind: 'buff', id: b.id, name: b.name, desc: b.desc };
        // 顶替随机结果中的一张，保证面板必有目标卡，且始终 3 卡不叠印
        opts = [opts[0], opts[1], forced].filter((o): o is UpgradeOption => !!o);
      }
    }
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
    let bossPhase = 0;
    let bossWarning = '';
    if (this.bossBrain && this.bossEnemy) {
      bossPhase = this.bossBrain.phase;
      const st = this.bossBrain.state;
      if (st === 'telegraph') bossWarning = '预警！';
      else if (st === 'roar') bossWarning = '狂暴！';
      else if (st === 'act') bossWarning = '躲避！';
    }
    this.hud.update({
      hp: this.stats.hp,
      maxHp: this.stats.maxHp,
      armor: this.player.armorValue,
      armorMax: this.player.armorMax,
      xpRatio: this.levelSys.ratio,
      xpCur: this.levelSys.xp,
      xpNeed: this.levelSys.need,
      level: this.levelSys.level,
      kills: this.kills,
      gold: this.gold,
      elapsed: this.elapsed,
      weapons: this.weapons.owned.map(w => ({ name: w.def.name, level: w.level, maxed: w.maxed })),
      bossHp, bossMaxHp, bossName, bossPhase, bossWarning
    });
  }

  private checkEnd(): void {
    if (this.elapsed >= GAME_DURATION) { this.finish(true); return; }
    if (!this.player.alive) this.finish(false);
  }

  private finish(win: boolean): void {
    if (this.isOver) return;   // 单次结算：胜负只结算一次
    this.isOver = true;
    // v0.9.1：胜负表情真实可见 —— 冻结前用胜负标志补渲一帧；此后 update 因 isOver 冻结，伤害全部停止
    if (win) this.player.setWin(true); else this.player.setLose(true);
    this.player.update(0.016, 0, 0);
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
    // 展示胜负表情 1.1s 后再进结算场景
    // v0.9.1: 改墙钟计时器（非 Phaser 游戏时钟）——低帧率/共享CPU下展示时长恒定约 1.1s 真实时间
    this.finishTimer = createFinishTimer(RESULT_DELAY_MS);
    this.finishTimer.start();
    this.resultData = data;
  }
}