// 启动场景：用代码绘制所有占位贴图（无需美术资源即可跑通）
// 所有纹理在内存里生成，后续换正式图集时只替换 key 对应的贴图即可
import Phaser from 'phaser';
import type { LoadingApi } from '../core/loadState.ts';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload(): void {
    // v0.9.2 加载体验：DOM 覆盖层（index.html）显示实时进度；资源失败不阻塞进菜单
    // （程序化贴图无外部依赖，Menu 对缺失背景有纯色兜底）。绝不把固定等待当修复。
    const loading = (window as unknown as { __LOADING?: LoadingApi }).__LOADING;
    this.load.on('progress', (p: number) => loading?.setProgress(p));
    this.load.on('loaderror', (file: unknown) => {
      const key = (file as { key?: string })?.key ?? 'unknown';
      loading?.error(key);
    });
    // 正式角色素材：用户设计图抠出的透明 PNG（保留白色头饰/围裙）
    this.load.image('player_whale', 'assets/player_whale.png');
    // v0.11.0 素材接线：大白饭/铁盆拾取图标 + 角色饭盆头 overlay 全部改用授权 PNG，
    // 不再走程序化占位（makeDrops/makeLoot 仅保留经验球/金币程序化生成）。
    this.load.image('loot_rice', 'assets/loot_rice.png');
    this.load.image('loot_bowl', 'assets/loot_bowl.png');
    this.load.image('rice_bowl', 'assets/rice_bowl.png');
    // 四张授权背景（3840x2160 原图已处理为 1920x1080 JPEG 放 public/assets/bg）
    // 全部在启动场景并行预载，局内切换不产生任何加载抖动
    this.load.image('bg_moon', 'assets/bg/bg_moon.jpg');
    this.load.image('bg_trench', 'assets/bg/bg_trench.jpg');
    this.load.image('bg_ship', 'assets/bg/bg_ship.jpg');
    this.load.image('bg_vortex', 'assets/bg/bg_vortex.jpg');
  }

  create(): void {
    // 所有资源已加载完成（preload 完成后才进入 create）→ 隐藏加载覆盖层，菜单秒开
    (window as unknown as { __LOADING?: LoadingApi }).__LOADING?.ready();
    // 角色贴图已在 preload 从正式素材加载，不再程序化生成
    this.makeEnemies();
    this.makeProjectiles();
    this.makeDrops();
    this.makePlayerFx();
    this.scene.start('Menu');
  }

  private makeEnemies(): void {
    this.makeFish('enemy_fish', 34, 26, 0x4a9fe8, 0xd6ecff, false);
    this.makeFish('enemy_dart', 28, 16, 0x2f7fd0, 0xa8d8ff, false);
    this.makeFish('enemy_fat', 44, 38, 0x3b8fe0, 0xe4f2ff, false);
    this.makeFish('enemy_boss', 64, 58, 0x2b6fc0, 0xd0e8ff, true);
    // v0.11.0 深海小怪（程序化占位，后续换正式图集只换 key）
    this.makeJelly('enemy_jelly');
    this.makeLantern('enemy_lantern');
  }

  // 水母：半透明伞盖 + 四条波浪触手 + 体内斑点（蓝紫系，与蓝鱼区分）
  private makeJelly(key: string): void {
    const g = this.add.graphics();
    // 伞盖
    g.fillStyle(0x9a6ff0, 0.85);
    g.fillEllipse(24, 12, 40, 22);
    g.fillStyle(0xc9aef7, 0.6);
    g.fillEllipse(24, 11, 30, 15);
    // 触手（折线近似波浪）
    g.lineStyle(3, 0xb48ef5, 0.9);
    g.beginPath();
    g.moveTo(14, 20); g.lineTo(10, 28); g.lineTo(17, 35); g.lineTo(15, 41);
    g.moveTo(24, 22); g.lineTo(22, 30); g.lineTo(27, 37); g.lineTo(25, 43);
    g.moveTo(34, 20); g.lineTo(38, 28); g.lineTo(31, 35); g.lineTo(34, 41);
    g.strokePath();
    // 斑点
    g.fillStyle(0xe6dbff, 0.9);
    g.fillCircle(18, 10, 3);
    g.fillCircle(30, 9, 2.6);
    g.fillCircle(24, 14, 2.2);
    // 顶部小冠
    g.fillStyle(0xc9aef7, 1);
    g.fillCircle(24, 2, 5);
    g.generateTexture(key, 48, 44);
    g.destroy();
  }

  // 灯笼鱼：深色身体 + 头顶发光诱饵 + 光晕（深海暖光，轮廓清晰）
  private makeLantern(key: string): void {
    const g = this.add.graphics();
    // 尾鳍
    g.fillStyle(0x24486b, 1);
    g.fillTriangle(3, 12, 12, 6, 12, 18);
    // 身体
    g.fillStyle(0x2e5577, 1);
    g.fillEllipse(22, 12, 28, 16);
    g.fillStyle(0x3d6a90, 0.85);
    g.fillEllipse(23, 13, 17, 9);
    // 眼睛
    g.fillStyle(0xffffff, 1);
    g.fillCircle(31, 9, 3.4);
    g.fillStyle(0x101c2c, 1);
    g.fillCircle(32, 9.6, 1.7);
    // 嘴巴（利齿感）
    g.fillStyle(0xfff2e6, 1);
    g.fillTriangle(34, 15, 38, 14, 36, 17);
    // 头顶诱饵杆 + 发光球 + 光晕
    g.lineStyle(2, 0x24486b, 1);
    g.beginPath(); g.moveTo(20, 3); g.lineTo(14, 0); g.lineTo(9, -4); g.strokePath();
    g.fillStyle(0xffe066, 0.25);
    g.fillCircle(9, -6, 7);
    g.fillStyle(0xffd447, 1);
    g.fillCircle(9, -6, 3.4);
    g.fillStyle(0xfffbe0, 1);
    g.fillCircle(9, -6, 1.6);
    g.generateTexture(key, 42, 26);
    g.destroy();
  }

  // 蓝色大肥鱼（面朝右）：尾鳍 + 椭圆身体 + 白肚皮 + 眼睛 + 王冠
  private makeFish(key: string, w: number, h: number, body: number, belly: number, crown: boolean): void {
    const g = this.add.graphics();

    // 尾鳍
    g.fillStyle(body, 1);
    g.fillTriangle(1, h / 2, w * 0.34, h * 0.12, w * 0.34, h * 0.88);

    // 身体
    g.fillStyle(body, 1);
    g.fillEllipse(w * 0.62, h / 2, w * 0.74, h * 0.8);

    // 肚皮
    g.fillStyle(belly, 0.9);
    g.fillEllipse(w * 0.64, h * 0.66, w * 0.42, h * 0.34);

    // 背鳍
    g.fillStyle(body, 1);
    g.fillTriangle(w * 0.5, h * 0.08, w * 0.66, h * 0.02, w * 0.7, h * 0.22);

    // 眼睛
    g.fillStyle(0xffffff, 1);
    g.fillCircle(w * 0.76, h * 0.36, h * 0.15);
    g.fillStyle(0x101c2c, 1);
    g.fillCircle(w * 0.79, h * 0.37, h * 0.075);

    // 腮红
    g.fillStyle(0xff9fb0, 0.7);
    g.fillCircle(w * 0.64, h * 0.52, h * 0.07);

    // 嘴
    g.fillStyle(0x22334a, 1);
    g.fillCircle(w * 0.92, h * 0.55, h * 0.045);

    // 王冠（Boss）
    if (crown) {
      g.fillStyle(0xffd447, 1);
      g.fillTriangle(w * 0.44, h * 0.02, w * 0.54, h * 0.22, w * 0.34, h * 0.22);
      g.fillTriangle(w * 0.56, h * -0.02, w * 0.66, h * 0.22, w * 0.46, h * 0.22);
      g.fillTriangle(w * 0.68, h * 0.02, w * 0.78, h * 0.22, w * 0.58, h * 0.22);
      g.fillRect(w * 0.34, h * 0.2, w * 0.44, h * 0.09);
    }

    g.generateTexture(key, w, h);
    g.destroy();
  }

  private makeProjectiles(): void {
    // 步枪弹：小黄圆
    let g = this.add.graphics();
    g.fillStyle(0xffe066, 1);
    g.fillCircle(6, 6, 5.5);
    g.fillStyle(0xfffbe0, 1);
    g.fillCircle(6, 6, 2.5);
    g.generateTexture('bullet', 12, 12);
    g.destroy();

    // 狙击弹：细长蓝条
    g = this.add.graphics();
    g.fillStyle(0x9fe8ff, 1);
    g.fillRoundedRect(0, 3, 22, 6, 3);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(14, 4, 8, 4, 2);
    g.generateTexture('bullet_sniper', 22, 12);
    g.destroy();

    // 肥鱼炮炮弹：大颗水弹（进化武器）
    g = this.add.graphics();
    g.fillStyle(0x4a9fe8, 1);
    g.fillCircle(11, 11, 10);
    g.fillStyle(0x9fd8ff, 1);
    g.fillCircle(11, 11, 7);
    g.fillStyle(0xe8f8ff, 1);
    g.fillCircle(8, 8, 3.5);
    g.generateTexture('bullet_cannon', 22, 22);
    g.destroy();

    // Boss 弹幕弹：橙色预警圆（v0.9.0）
    g = this.add.graphics();
    g.fillStyle(0xff5a4d, 1);
    g.fillCircle(7, 7, 6.5);
    g.fillStyle(0xffc9a0, 0.9);
    g.fillCircle(7, 7, 3.8);
    g.fillStyle(0xfff2e6, 1);
    g.fillCircle(5.5, 5.5, 1.8);
    g.generateTexture('ebullet', 14, 14);
    g.destroy();

    // v0.12.0 珊瑚弩箭：珊瑚色细长箭（穿透直线慢速）
    g = this.add.graphics();
    g.fillStyle(0xff7a6b, 1);
    g.fillRoundedRect(0, 4, 26, 5, 2);
    g.fillStyle(0xffc9c0, 1);
    g.fillRoundedRect(16, 5, 10, 3, 1.5);
    g.fillStyle(0xffe0d9, 1);
    g.fillTriangle(2, 1, 2, 13, 10, 7);
    g.generateTexture('bullet_coral', 26, 14);
    g.destroy();

    // v0.12.0 泡泡弹：半透明大泡泡（大范围低伤击退）
    g = this.add.graphics();
    g.fillStyle(0x9fe8ff, 0.35);
    g.fillCircle(12, 12, 11);
    g.lineStyle(2, 0xd8f6ff, 0.8);
    g.strokeCircle(12, 12, 10);
    g.fillStyle(0xffffff, 0.85);
    g.fillCircle(9, 8, 3);
    g.generateTexture('bullet_bubble', 24, 24);
    g.destroy();

    // 尾鳍环绕体（鲸尾造型，呼应主角）
    g = this.add.graphics();
    g.fillStyle(0x8fe6ff, 0.95);
    g.fillTriangle(0, 4, 24, 14, 0, 24);
    g.fillStyle(0xd8f6ff, 0.9);
    g.fillTriangle(4, 8, 18, 14, 4, 20);
    g.generateTexture('fin', 24, 28);
    g.destroy();
  }

  // v0.11.0：大白饭/饭盆拾取贴图改为正式 PNG（loot_rice/loot_bowl），
  // 此处仅保留仍为程序化的经验球与金币占位。
  private makeDrops(): void {
    // 经验球：青绿小方块
    let g = this.add.graphics();
    g.fillStyle(0x5ce8c8, 1);
    g.fillRoundedRect(1, 1, 12, 12, 4);
    g.fillStyle(0xc8fff2, 0.9);
    g.fillRoundedRect(4, 3, 5, 5, 2);
    g.generateTexture('gem_xp', 14, 14);
    g.destroy();

    // 金币
    g = this.add.graphics();
    g.fillStyle(0xffc93c, 1);
    g.fillCircle(8, 8, 7);
    g.fillStyle(0xfff3b0, 1);
    g.fillCircle(6, 6, 3);
    g.generateTexture('gem_gold', 16, 16);
    g.destroy();
  }

  // ---- v0.9.0 角色分层表现：程序化表情叠加 + 蓝色鲸鱼枪 ----
  // 说明：不是手绘帧/换造型。表情=皮肤色椭圆盖住原图眼睛→在上面重画表情眼/嘴；
  // 对齐到 player_whale.png 像素分析出的真实锚点（双眼/嘴）。枪=程序化绘制的鲸鱼造型。
  private makePlayerFx(): void {
    this.makeExpressionTextures();
    this.makeWhaleGunTexture();
  }

  // 表情锚点（原图像素）→ 2x 贴图坐标。素材 308x320，显示高 112 → 基准缩放 0.35。
  private fxXY(x: number, y: number): [number, number] {
    const s = (112 / 320) * 2;   // 2x 贴图空间
    const ox = 28 + (166 - 154) * s;   // 脸中心贴图坐标（56 宽画布）
    const oy = 22 + (40 - 160) * s;    // 44 高画布
    return [ox + (x - 166) * s, oy + (y - 40) * s];
  }

  private canvasTexture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): void {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    draw(ctx);
    this.textures.addCanvas(key, c);
  }

  private makeExpressionTextures(): void {
    const W = 56, H = 44;
    const [elx, ely] = this.fxXY(150, 36);   // 左眼
    const [erx, ery] = this.fxXY(182, 36);   // 右眼
    const [mx, my] = this.fxXY(176, 48);     // 嘴
    const SKIN = '#cac6ca';
    const DARK = '#23262e';

    const cover = (ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = SKIN;
      ctx.beginPath(); ctx.ellipse(elx, ely, 4.6, 4.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(erx, ery, 4.6, 4.2, 0, 0, Math.PI * 2); ctx.fill();
    };
    const eye = (ctx: CanvasRenderingContext2D, x: number, y: number, r = 2.6, ring = false) => {
      if (ring) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, r + 1.2, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = DARK;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.38, 0, Math.PI * 2); ctx.fill();
    };
    const closedEye = (ctx: CanvasRenderingContext2D, x: number, y: number, up = false) => {
      ctx.strokeStyle = DARK; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
      ctx.beginPath();
      const dy = up ? -1.1 : 1.1;
      ctx.moveTo(x - 3.4, y - dy); ctx.quadraticCurveTo(x, y + dy, x + 3.4, y - dy);
      ctx.stroke();
    };
    const mouthLine = (ctx: CanvasRenderingContext2D, w = 6, dy = 0, smile = 0) => {
      ctx.strokeStyle = '#6b4a4a'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(mx - w / 2, my + dy);
      if (smile === 0) ctx.lineTo(mx + w / 2, my + dy);
      else ctx.quadraticCurveTo(mx, my + dy + smile, mx + w / 2, my + dy);
      ctx.stroke();
    };

    // idle：睁眼微笑
    this.canvasTexture('fx_idle', W, H, (ctx) => {
      cover(ctx);
      eye(ctx, elx, ely); eye(ctx, erx, ery);
      mouthLine(ctx, 6, 0, 2.2);
    });
    // blink：闭眼
    this.canvasTexture('fx_blink', W, H, (ctx) => {
      cover(ctx);
      closedEye(ctx, elx, ely); closedEye(ctx, erx, ery);
      mouthLine(ctx, 6, 0, 1.6);
    });
    // move：专注半眯眼 + 抿嘴
    this.canvasTexture('fx_move', W, H, (ctx) => {
      cover(ctx);
      closedEye(ctx, elx, ely); closedEye(ctx, erx, ery);
      ctx.strokeStyle = DARK; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(elx - 3, ely - 3.6); ctx.lineTo(elx + 3, ely - 2.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(erx - 3, ely - 3.6); ctx.lineTo(erx + 3, ely - 2.2); ctx.stroke();
      mouthLine(ctx, 7, 0.6, -0.6);
    });
    // fire：单眼眯 + 张嘴（射击专注）
    this.canvasTexture('fx_fire', W, H, (ctx) => {
      cover(ctx);
      eye(ctx, elx, ely); closedEye(ctx, erx, ery);
      ctx.fillStyle = '#6b4a4a';
      ctx.beginPath(); ctx.ellipse(mx, my + 1, 2.4, 2.0, 0, 0, Math.PI * 2); ctx.fill();
    });
    // hurt：痛苦闭眼 + 波浪嘴
    this.canvasTexture('fx_hurt', W, H, (ctx) => {
      cover(ctx);
      ctx.strokeStyle = DARK; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(elx - 3.4, ely + 2.4); ctx.lineTo(elx + 3.4, ely - 1.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(erx - 3.4, ely + 2.4); ctx.lineTo(erx + 3.4, ely - 1.4); ctx.stroke();
      ctx.strokeStyle = '#8a4a4a'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(mx - 3.4, my + 1);
      ctx.quadraticCurveTo(mx - 1.7, my + 2.8, mx, my + 1);
      ctx.quadraticCurveTo(mx + 1.7, my - 0.8, mx + 3.4, my + 1);
      ctx.stroke();
    });
    // alert：瞪大眼 + 张嘴（Boss 预警）
    this.canvasTexture('fx_alert', W, H, (ctx) => {
      cover(ctx);
      eye(ctx, elx, ely, 3.6, true); eye(ctx, erx, ery, 3.6, true);
      ctx.fillStyle = '#8a4a4a';
      ctx.beginPath(); ctx.ellipse(mx, my + 1, 3.0, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    });
    // win：^^ 眼 + 大微笑
    this.canvasTexture('fx_win', W, H, (ctx) => {
      cover(ctx);
      closedEye(ctx, elx, ely, true); closedEye(ctx, erx, ery, true);
      ctx.strokeStyle = '#6b4a4a'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(mx - 4, my - 0.4); ctx.quadraticCurveTo(mx, my + 3.6, mx + 4, my - 0.4); ctx.stroke();
    });
    // lose：沮丧闭眼 + 撇嘴
    this.canvasTexture('fx_lose', W, H, (ctx) => {
      cover(ctx);
      closedEye(ctx, elx, ely, true); closedEye(ctx, erx, ery, true);
      ctx.strokeStyle = '#8a4a4a'; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(mx - 3.4, my + 2.4); ctx.quadraticCurveTo(mx, my - 1.2, mx + 3.4, my + 2.4); ctx.stroke();
    });
  }

  // 蓝色鲸鱼枪（程序化绘制，非角色造型）：枪身=鲸鱼身体，尾鳍=枪托，嘴=枪口。
  // 贴图朝 +X，origin 设在枪把（握持处）。2x 绘制 0.5 显示，保证细部清晰。
  private makeWhaleGunTexture(): void {
    const W = 110, H = 60;
    this.canvasTexture('player_gun', W, H, (ctx) => {
      const cx = 60, cy = 30;   // 身体中心
      // 尾鳍（枪托）
      ctx.fillStyle = '#2f6fc0';
      ctx.beginPath();
      ctx.moveTo(14, cy - 16); ctx.lineTo(4, cy - 30); ctx.lineTo(16, cy - 4); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(14, cy + 16); ctx.lineTo(4, cy + 30); ctx.lineTo(16, cy + 4); ctx.closePath(); ctx.fill();
      // 背鳍
      ctx.beginPath();
      ctx.moveTo(cx - 20, cy - 18); ctx.lineTo(cx - 8, cy - 34); ctx.lineTo(cx + 2, cy - 16); ctx.closePath(); ctx.fill();
      // 身体
      ctx.fillStyle = '#3f8fe8';
      ctx.beginPath(); ctx.ellipse(cx, cy, 44, 20, 0, 0, Math.PI * 2); ctx.fill();
      // 肚皮（白）
      ctx.fillStyle = '#e8f4ff';
      ctx.beginPath(); ctx.ellipse(cx + 2, cy + 7, 34, 11, 0, 0, Math.PI * 2); ctx.fill();
      // 枪口（鲸鱼嘴）
      ctx.fillStyle = '#123';
      ctx.beginPath(); ctx.arc(101, cy, 8.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd447';
      ctx.beginPath(); ctx.arc(100, cy, 4.6, 0, Math.PI * 2); ctx.fill();
      // 眼
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(76, cy - 8, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#123';
      ctx.beginPath(); ctx.arc(78, cy - 8, 2.8, 0, Math.PI * 2); ctx.fill();
      // 侧鳍
      ctx.beginPath();
      ctx.moveTo(cx + 10, cy + 14); ctx.lineTo(cx + 22, cy + 26); ctx.lineTo(cx + 18, cy + 12); ctx.closePath(); ctx.fill();
      // 枪把（握持处）：身体下方深色握柄
      ctx.fillStyle = '#1c3f66';
      ctx.fillRect(38, cy + 12, 20, 14);
      ctx.fillStyle = '#0e2740';
      ctx.fillRect(38, cy + 12, 20, 5);
      // 高光
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy - 6, 32, Math.PI * 1.15, Math.PI * 1.7); ctx.stroke();
    });
  }
}
