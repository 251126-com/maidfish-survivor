// 主菜单（v0.14.0 大厅化）：开始游戏 + 角色选择/解锁/皮肤 + 永久强化商店
// v0.8.0：新增「起始场景」四卡选择 —— 四张授权背景首屏即可见、可点选，
//         选中项作为开局背景传给 GameScene（正常玩法仍默认随机轮换）。
// v0.9.0：菜单重设计 —— 顶部标题区 / 独立「开始游戏」面板 / 独立「永久强化」商店面板，
//         蓝白层级清晰、面板分区不拥挤；开始按钮保持在 (640,230) 兼容既有 e2e。
// v0.14.0：大厅化 —— 左下角「鱼缸里睡觉的小鲸鱼娘」作大厅背景（程序化绘制，
//          与现有立绘风格统一）；主区改为 tab 双页：角色选择（解锁/选用/皮肤）
//          与永久强化商店；开始游戏入口、起始场景选择、金币显示保持不变。
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config/balance.ts';
import { coverFit } from '../config/cover.ts';
import { BG_ORDER, randomStartIndex } from '../config/background.ts';
import { META_TREE } from '../config/upgrades.ts';
import { WEAPONS } from '../config/weapons.ts';
import { CHARACTERS, CHARACTER_ORDER, DEFAULT_SKIN, SKIN_BOWL, SKIN_MAID, isSkinId, type SkinId } from '../config/characters.ts';
import { loadSave, writeSave, unlockCharacter, selectCharacter, setSkin } from '../core/save.ts';
import { faceScreenOffset } from '../game/playerFx.ts';
import { VERSION } from '../config/version.ts';

// v0.9.1: 商店购买 scene.restart() 会重建实例，模块级变量跨实例保留用户选中的起始背景
let lastBgPick: number | null = null;

type MenuTab = 'char' | 'shop';

export class MenuScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;
  private hintText: Phaser.GameObjects.Text | null = null;
  /** 当前选择的起始背景下标（0..3），默认随机；购买重载后沿用上次选择 */
  private bgPick = lastBgPick ?? randomStartIndex();
  private bgCards: Phaser.GameObjects.Rectangle[] = [];
  private bgLabels: Phaser.GameObjects.Text[] = [];
  private bgImage!: Phaser.GameObjects.Image;
  private bgNameText!: Phaser.GameObjects.Text;
  private bgMask!: Phaser.GameObjects.Rectangle;

  // v0.14.0 tab 双页（角色 / 强化）
  private tabC: MenuTab = 'char';
  private tabBtnChar!: Phaser.GameObjects.Rectangle;
  private tabBtnShop!: Phaser.GameObjects.Rectangle;
  private tabLabelChar!: Phaser.GameObjects.Text;
  private tabLabelShop!: Phaser.GameObjects.Text;
  private charC!: Phaser.GameObjects.Container;
  private shopC!: Phaser.GameObjects.Container;

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

    // v0.14.0 金币显示移到右上（角色页/强化页共享，购买/解锁后实时刷新）
    this.goldText = this.add.text(GAME_W - 78, 52, `金币：${save.gold}`, {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffd447',
      stroke: '#062033', strokeThickness: 4
    }).setOrigin(1, 0.5).setDepth(3);

    // ============ 独立面板①：开始游戏（主按钮 + 起始场景选择，位置不变） ============
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

    // ============ v0.14.0 tab 双页：角色选择 / 永久强化 ============
    const tabY = 368;
    this.tabBtnChar = this.add.rectangle(560, tabY, 200, 42, 0x2f7fd0, 1)
      .setStrokeStyle(2, 0x9fe8ff).setDepth(2).setInteractive({ useHandCursor: true });
    this.tabLabelChar = this.add.text(560, tabY, '🧜 角色选择', {
      fontFamily: 'monospace', fontSize: '17px', color: '#ffffff'
    }).setOrigin(0.5).setDepth(3);
    this.tabBtnShop = this.add.rectangle(720, tabY, 200, 42, 0x16283f, 1)
      .setStrokeStyle(2, 0x3d6c9e).setDepth(2).setInteractive({ useHandCursor: true });
    this.tabLabelShop = this.add.text(720, tabY, '⚡ 永久强化', {
      fontFamily: 'monospace', fontSize: '17px', color: '#bcd8f0'
    }).setOrigin(0.5).setDepth(3);
    this.tabBtnChar.on('pointerdown', () => this.switchTab('char'));
    this.tabBtnShop.on('pointerdown', () => this.switchTab('shop'));

    // 内容底框（tab 双页共用）
    this.add.rectangle(GAME_W / 2, 522, 1160, 250, 0x0c1c2e, 0.88)
      .setStrokeStyle(2, 0x2f6fc0).setDepth(2);

    this.charC = this.add.container(0, 0).setDepth(3);
    this.shopC = this.add.container(0, 0).setDepth(3);
    this.rebuildChars();
    this.buildShop(save.gold, this.shopC);
    this.switchTab(this.tabC);

    // v0.14.0 大厅背景：鱼缸里睡觉的小鲸鱼娘（左下角，程序化绘制）
    this.buildLobbyFishTank();

    this.add.text(GAME_W / 2, GAME_H - 22, `触摸拖动 / WASD 移动 · 自动开火 · v${VERSION}`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#54708c'
    }).setOrigin(0.5).setDepth(2);

    // 自动化钩子：e2e 可读取/设置当前选中的起始场景
    (window as unknown as { __MENU_BG?: { get: () => number; set: (i: number) => void; count: number } }).__MENU_BG = {
      get: () => this.bgPick,
      set: (i: number) => this.pickBg(i),
      count: BG_ORDER.length
    };
    // v0.14.0 自动化钩子：角色/皮肤状态 + 走真实 UI 逻辑的操作入口
    (window as unknown as {
      __MENU_CHAR?: {
        state: () => { charId: string; skin: string; unlocked: string[]; gold: number; tab: MenuTab };
        unlock: (id: string) => void;
        select: (id: string) => void;
        toggleSkin: () => void;
        switchTab: (t: MenuTab) => void;
      }
    }).__MENU_CHAR = {
      state: () => {
        const s = loadSave();
        return { charId: s.charId, skin: s.skin, unlocked: s.unlocked, gold: s.gold, tab: this.tabC };
      },
      unlock: (id) => this.handleCharClick(id),
      select: (id) => this.handleCharClick(id),
      toggleSkin: () => this.handleSkinClick(),
      switchTab: (t) => this.switchTab(t)
    };
  }

  // ---- v0.14.0 大厅背景：鱼缸 + 闭眼睡觉的小鲸鱼娘（女仆装默认形态） ----
  private buildLobbyFishTank(): void {
    const cx = 150;   // 左下角，避开中央开始面板(330~950)与角色/商店区
    const cy = 300;

    // 玻璃缸 + 水体 + 砂砾 + 水草（程序化 Graphics，一次性绘制）
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x1c3a55, 0.55);
    g.fillRoundedRect(cx - 108, cy - 100, 216, 220, 26);
    g.lineStyle(3, 0x9fd8ff, 0.85);
    g.strokeRoundedRect(cx - 108, cy - 100, 216, 220, 26);
    g.lineStyle(4, 0x4a7aa8, 1);
    g.strokeRoundedRect(cx - 114, cy - 106, 228, 9, 6);   // 缸沿
    g.fillStyle(0x8a6a3a, 0.9);
    g.fillEllipse(cx, cy + 102, 196, 22);                 // 砂砾
    g.lineStyle(3, 0x2fa86a, 0.95);
    g.beginPath();
    g.moveTo(cx - 78, cy + 96); g.lineTo(cx - 86, cy + 66); g.lineTo(cx - 74, cy + 46);
    g.lineTo(cx - 82, cy + 30); g.lineTo(cx - 70, cy + 52); g.lineTo(cx - 78, cy + 76);
    g.strokePath();
    g.lineStyle(3, 0x3ecf8a, 0.95);
    g.beginPath();
    g.moveTo(cx + 82, cy + 96); g.lineTo(cx + 90, cy + 64); g.lineTo(cx + 80, cy + 44);
    g.lineTo(cx + 86, cy + 26); g.lineTo(cx + 74, cy + 50); g.lineTo(cx + 82, cy + 74);
    g.strokePath();

    // 鲸鱼娘立绘（女仆装 = 原图默认形态）：闭眼睡觉 + 微斜躺靠
    const displayH = 96;
    const whale = this.add.image(cx, cy + 8, 'player_whale');
    whale.setScale(displayH / Math.max(1, whale.height));
    whale.setRotation(0.08);
    whale.setDepth(2);
    // 闭眼表情叠加（fx_blink = 闭眼，1x 显示）
    const off = faceScreenOffset(displayH);
    const fx = this.add.image(cx + off.cx, cy + 8 + off.cy, 'fx_blink');
    fx.setScale(0.5, 0.5);
    fx.setDepth(3);
    // 呼吸浮动（立绘与表情同步，保持贴脸）
    this.tweens.add({ targets: whale, y: cy + 5, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: fx, y: cy + 8 + off.cy - 3, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Zzz 气泡（三档字号、错峰循环上飘）
    for (let i = 0; i < 3; i++) {
      const z = this.add.text(cx + 42 + i * 13, cy - 26 - i * 22, i === 2 ? 'Z' : 'z', {
        fontFamily: 'monospace', fontSize: i === 2 ? '22px' : '15px', color: '#9fd8ff'
      }).setDepth(2).setAlpha(0);
      const baseY = cy - 26 - i * 22;
      this.tweens.add({
        targets: z, y: baseY - 80, alpha: 1,
        delay: i * 1100, duration: 2400, repeat: -1, repeatDelay: 900,
        ease: 'Sine.easeOut',
        onRepeat: () => { z.setAlpha(0); z.y = baseY; }
      });
    }
    // 水面小气泡
    for (let i = 0; i < 4; i++) {
      const b = this.add.circle(cx - 62 + i * 42, cy + 62 + Math.random() * 46, 4, 0xbfe8ff, 0.6).setDepth(2);
      const baseY = b.y;
      this.tweens.add({
        targets: b, y: cy - 64, alpha: 0,
        duration: 2400 + Math.random() * 1300, delay: i * 620, repeat: -1,
        ease: 'Sine.easeOut',
        onRepeat: () => { b.setAlpha(0.6); b.y = baseY; }
      });
    }
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
    lastBgPick = i;   // v0.9.1: 购买后 scene.restart() 不清空用户选择
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
    // v0.9.2 失败兜底：背景贴图未加载成功时隐藏图片，露出深色底（不白屏、不抛错）
    if (this.textures.exists(phase.key)) {
      this.bgImage.setTexture(phase.key);
      const src = this.textures.get(phase.key).getSourceImage();
      const cover = coverFit(src.width, src.height, GAME_W, GAME_H);
      this.bgImage.setDisplaySize(cover.w, cover.h);
      this.bgImage.setVisible(true);
    } else {
      this.bgImage.setVisible(false);
    }
    this.bgImage.setDepth(0);
    if (this.bgNameText) this.bgNameText.destroy();
    this.bgNameText = this.add.text(GAME_W / 2, 336, `起始：${phase.name}  ·  点击开始进入`, {
      fontFamily: 'monospace', fontSize: '12px', color: '#9fd8ff'
    }).setOrigin(0.5).setDepth(2);
  }

  // ---- v0.14.0 tab 切换（角色 / 强化），隐藏页按钮被守卫拦截 ----
  private switchTab(t: MenuTab): void {
    this.tabC = t;
    const charOn = t === 'char';
    this.tabBtnChar.setFillStyle(charOn ? 0x2f7fd0 : 0x16283f);
    this.tabBtnChar.setStrokeStyle(2, charOn ? 0x9fe8ff : 0x3d6c9e);
    this.tabLabelChar.setColor(charOn ? '#ffffff' : '#bcd8f0');
    this.tabBtnShop.setFillStyle(charOn ? 0x16283f : 0x2f7fd0);
    this.tabBtnShop.setStrokeStyle(2, charOn ? 0x3d6c9e : 0x9fe8ff);
    this.tabLabelShop.setColor(charOn ? '#bcd8f0' : '#ffffff');
    this.charC.setVisible(charOn);
    this.shopC.setVisible(!charOn);
  }

  private addIn<T extends Phaser.GameObjects.GameObject>(c: Phaser.GameObjects.Container, o: T): T {
    c.add(o);
    return o;
  }

  // ---- v0.14.0 角色选择页：3 角色卡 + 皮肤切换行 ----
  private rebuildChars(): void {
    this.charC.destroy(true);
    this.charC = this.add.container(0, 0).setDepth(3);
    this.charC.setVisible(this.tabC === 'char');
    const save = loadSave();
    const gold = save.gold;

    const cardW = 330;
    const cardH = 142;
    const gap = 26;
    const totalW = cardW * CHARACTER_ORDER.length + gap * (CHARACTER_ORDER.length - 1);
    const startX = (GAME_W - totalW) / 2 + cardW / 2;
    const cy = 462;

    CHARACTER_ORDER.forEach((id, i) => {
      const ch = CHARACTERS[id];
      const cx = startX + i * (cardW + gap);
      const unlocked = save.unlocked.includes(id);
      const current = save.charId === id;
      const canAfford = gold >= ch.unlockCost;
      const theme = `#${ch.color.toString(16).padStart(6, '0')}`;

      const card = this.addIn(this.charC, this.add.rectangle(cx, cy, cardW, cardH, 0x14263c, 1)
        .setStrokeStyle(current ? 3 : 2, current ? ch.color : (unlocked ? 0x3d6c9e : 0x5a6a7a))
        .setInteractive({ useHandCursor: true }));
      card.on('pointerover', () => card.setFillStyle(0x1f3a5f));
      card.on('pointerout', () => card.setFillStyle(0x14263c));
      card.on('pointerdown', () => this.handleCharClick(id));

      this.addIn(this.charC, this.add.text(cx, cy - 54, ch.name, {
        fontFamily: 'monospace', fontSize: '18px', color: theme
      }).setOrigin(0.5));
      this.addIn(this.charC, this.add.text(cx, cy - 28, ch.tag, {
        fontFamily: 'monospace', fontSize: '11px', color: '#9fb8d0'
      }).setOrigin(0.5));
      this.addIn(this.charC, this.add.text(cx, cy + 4, ch.desc, {
        fontFamily: 'monospace', fontSize: '10px', color: '#8fb8d8', align: 'center'
      }).setOrigin(0.5));
      const w = WEAPONS[ch.weaponId];
      this.addIn(this.charC, this.add.text(cx - cardW / 2 + 12, cy + 42, `初始武器：${w.name}`, {
        fontFamily: 'monospace', fontSize: '11px', color: '#7fd4ff'
      }).setOrigin(0, 0.5));

      let stateText: string;
      let stateColor: string;
      if (current) { stateText = '✓ 使用中'; stateColor = '#4de8c2'; }
      else if (unlocked) { stateText = '点击使用'; stateColor = '#cfeaff'; }
      else { stateText = canAfford ? `${ch.unlockCost} 金币` : `🔒 ${ch.unlockCost} 金币`; stateColor = canAfford ? '#ffd447' : '#7a8a9a'; }
      this.addIn(this.charC, this.add.text(cx + cardW / 2 - 12, cy + 42, stateText, {
        fontFamily: 'monospace', fontSize: '14px', color: stateColor
      }).setOrigin(1, 0.5));
    });

    // 皮肤切换行（女仆装默认 / 饭盆头搞笑）
    const skinId: SkinId = isSkinId(save.skin) ? save.skin : DEFAULT_SKIN;
    const skinName = skinId === SKIN_MAID ? '女仆装' : '饭盆头';
    const skinBtn = this.addIn(this.charC, this.add.rectangle(GAME_W / 2, 572, 560, 44, 0x1a3050, 1)
      .setStrokeStyle(2, 0x4d7fb5).setInteractive({ useHandCursor: true }));
    skinBtn.on('pointerover', () => skinBtn.setFillStyle(0x244a70));
    skinBtn.on('pointerout', () => skinBtn.setFillStyle(0x1a3050));
    skinBtn.on('pointerdown', () => this.handleSkinClick());
    this.addIn(this.charC, this.add.text(GAME_W / 2, 572, `👗 皮肤：${skinName}（点击切换 · 女仆装默认 · 饭盆头搞笑）`, {
      fontFamily: 'monospace', fontSize: '15px', color: '#e8f4ff'
    }).setOrigin(0.5));
    this.addIn(this.charC, this.add.text(GAME_W / 2, 626, '点击卡片：解锁 / 选用（选择即存档）· 初始武器与特性随角色变化', {
      fontFamily: 'monospace', fontSize: '12px', color: '#54708c'
    }).setOrigin(0.5));
  }

  // 角色卡点击：已解锁→选用；未解锁→金币够则解锁并选用，不够则提示
  private handleCharClick(id: string): void {
    if (this.tabC !== 'char') return;   // 隐藏页守卫
    const s = loadSave();
    if (!CHARACTERS[id]) return;
    if (s.charId === id) return;
    if (s.unlocked.includes(id)) {
      selectCharacter(s, id);
      writeSave(s);
      this.afterProgression(`角色切换 → ${CHARACTERS[id].name}`);
    } else if (unlockCharacter(s, id)) {
      writeSave(s);
      this.afterProgression(`解锁角色 → ${CHARACTERS[id].name}（已自动选用）`);
    } else {
      this.flashGold();
      this.showHint('金币不足，先去战斗攒金币吧');
    }
  }

  // 皮肤切换：女仆装(默认) <-> 饭盆头(搞笑)，纯外观即写档
  private handleSkinClick(): void {
    if (this.tabC !== 'char') return;
    const s = loadSave();
    const ns = s.skin === SKIN_MAID ? SKIN_BOWL : SKIN_MAID;
    setSkin(s, ns);
    writeSave(s);
    this.rebuildChars();
    this.showHint(ns === SKIN_MAID ? '皮肤 → 女仆装（默认 · 正常卖萌形态）' : '皮肤 → 饭盆头（搞笑形态）');
  }

  // 角色进度变更后的统一刷新（金币 + 角色页重建）
  private afterProgression(msg: string): void {
    this.goldText.setText(`金币：${loadSave().gold}`);
    this.rebuildChars();
    this.showHint(msg);
  }

  // ---- 永久强化商店（v0.9.x 原逻辑，改为容器内 + 局部重建） ----
  private buildShop(gold: number, c: Phaser.GameObjects.Container): void {
    this.addIn(c, this.add.text(GAME_W / 2, 412, '— 永久强化（金币保留，越打越强）—', {
      fontFamily: 'monospace', fontSize: '16px', color: '#bcd8f0'
    }).setOrigin(0.5));

    const cols = 3;
    const cardW = 348;
    const cardH = 78;
    const gapX = 26;
    const gapY = 16;
    const totalW = cardW * cols + gapX * (cols - 1);
    const startX = (GAME_W - totalW) / 2 + cardW / 2;
    const startY = 442;

    META_TREE.forEach((m, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cardW + gapX);
      const cy = startY + row * (cardH + gapY);

      const save = loadSave();
      const rank = save.meta[m.id] ?? 0;
      const maxed = rank >= m.maxRank;
      const cost = m.cost(rank);

      const card = this.addIn(c, this.add.rectangle(cx, cy, cardW, cardH, 0x14263c, 1)
        .setStrokeStyle(2, maxed ? 0x4de8c2 : 0x3d6c9e));
      this.addIn(c, this.add.text(cx - cardW / 2 + 14, cy - cardH / 2 + 12, `${m.name}  Lv.${rank}/${m.maxRank}`, {
        fontFamily: 'monospace', fontSize: '16px', color: '#eaf6ff'
      }));
      this.addIn(c, this.add.text(cx - cardW / 2 + 14, cy - cardH / 2 + 40, m.desc, {
        fontFamily: 'monospace', fontSize: '12px', color: '#8fb8d8'
      }));
      const priceLabel = maxed ? '已满级' : `${cost} 金币`;
      this.addIn(c, this.add.text(cx + cardW / 2 - 14, cy + 4, priceLabel, {
        fontFamily: 'monospace', fontSize: '15px',
        color: maxed ? '#4de8c2' : (gold >= cost ? '#ffd447' : '#7a8a9a')
      }).setOrigin(1, 0.5));

      if (!maxed) {
        card.setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => {
          if (this.tabC !== 'shop') return;   // 隐藏页守卫
          const s = loadSave();
          const r = s.meta[m.id] ?? 0;
          if (r >= m.maxRank) return;
          const cst = m.cost(r);
          if (s.gold < cst) {
            this.flashGold();
            return;
          }
          s.gold -= cst;
          s.meta[m.id] = r + 1;
          writeSave(s);
          this.goldText.setText(`金币：${s.gold}`);
          this.rebuildShop();
          this.showHint(`${m.name} → Lv.${r + 1}`);
        });
      }
    });

    this.addIn(c, this.add.text(GAME_W / 2, 636, '金币永久保留 · 强化效果跨局叠加 · 点击卡片购买', {
      fontFamily: 'monospace', fontSize: '13px', color: '#54708c'
    }).setOrigin(0.5));
  }

  private rebuildShop(): void {
    this.shopC.destroy(true);
    this.shopC = this.add.container(0, 0).setDepth(3);
    this.shopC.setVisible(this.tabC === 'shop');
    this.buildShop(loadSave().gold, this.shopC);
  }

  private flashGold(): void {
    if (!this.goldText) return;
    this.tweens.add({
      targets: this.goldText,
      x: this.goldText.x + 8,
      duration: 60,
      yoyo: true,
      repeat: 2
    });
  }

  private showHint(msg: string): void {
    if (this.hintText) this.hintText.destroy();
    this.hintText = this.add.text(GAME_W / 2, 404, msg, {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffd447',
      stroke: '#062033', strokeThickness: 3
    }).setOrigin(0.5).setDepth(10);
    this.time.delayedCall(1800, () => {
      this.hintText?.destroy();
      this.hintText = null;
    });
  }
}
