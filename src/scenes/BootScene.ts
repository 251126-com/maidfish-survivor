// 启动场景：用代码绘制所有占位贴图（无需美术资源即可跑通）
// 所有纹理在内存里生成，后续换正式图集时只替换 key 对应的贴图即可
import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload(): void {
    // 正式角色素材：用户设计图抠出的透明 PNG（保留白色头饰/围裙）
    this.load.image('player_whale', 'assets/player_whale.png');
    // 四张授权背景（3840x2160 原图已处理为 1920x1080 JPEG 放 public/assets/bg）
    // 全部在启动场景并行预载，局内切换不产生任何加载抖动
    this.load.image('bg_moon', 'assets/bg/bg_moon.jpg');
    this.load.image('bg_trench', 'assets/bg/bg_trench.jpg');
    this.load.image('bg_ship', 'assets/bg/bg_ship.jpg');
    this.load.image('bg_vortex', 'assets/bg/bg_vortex.jpg');
  }

  create(): void {
    // 角色贴图已在 preload 从正式素材加载，不再程序化生成
    this.makeEnemies();
    this.makeProjectiles();
    this.makeDrops();
    this.makeLoot();
    this.makePlayerFx();
    this.scene.start('Menu');
  }

  private makeEnemies(): void {
    this.makeFish('enemy_fish', 34, 26, 0x4a9fe8, 0xd6ecff, false);
    this.makeFish('enemy_dart', 28, 16, 0x2f7fd0, 0xa8d8ff, false);
    this.makeFish('enemy_fat', 44, 38, 0x3b8fe0, 0xe4f2ff, false);
    this.makeFish('enemy_boss', 64, 58, 0x2b6fc0, 0xd0e8ff, true);
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

    // 尾鳍环绕体（鲸尾造型，呼应主角）
    g = this.add.graphics();
    g.fillStyle(0x8fe6ff, 0.95);
    g.fillTriangle(0, 4, 24, 14, 0, 24);
    g.fillStyle(0xd8f6ff, 0.9);
    g.fillTriangle(4, 8, 18, 14, 4, 20);
    g.generateTexture('fin', 24, 28);
    g.destroy();
  }

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

    // 大白饭（拾取回血）：小碗 + 白饭堆
    g = this.add.graphics();
    g.fillStyle(0xe8eef4, 1);
    g.fillEllipse(10, 13, 16, 7);
    g.fillStyle(0xd6e4f0, 1);
    g.fillEllipse(10, 12, 15, 6);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(10, 8, 6.5);
    g.fillStyle(0xf2ecdc, 0.9);
    g.fillCircle(8, 7, 2);
    g.fillCircle(12, 9, 1.6);
    g.generateTexture('loot_rice', 20, 18);
    g.destroy();

    // 饭盆（拾取护甲）：宽脸盆 + 白饭堆
    g = this.add.graphics();
    g.fillStyle(0xb8cfe0, 1);
    g.fillEllipse(11, 15, 22, 9);
    g.fillStyle(0xe6f1fa, 1);
    g.fillEllipse(11, 13, 20, 8);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(11, 9, 7);
    g.fillStyle(0xf2ecdc, 0.9);
    g.fillCircle(9, 8, 2);
    g.fillCircle(13, 10, 1.8);
    g.generateTexture('loot_bowl', 22, 20);
    g.destroy();
  }

  // 程序化「大白饭饭盆」：角色有护甲时头顶的 overlay（跟随翻面/动作）
  private makeLoot(): void {
    const g = this.add.graphics();

    // 盆身（脸盆）：浅蓝灰半椭球 + 盆沿
    g.fillStyle(0x9fb8cc, 1);
    g.fillEllipse(36, 50, 64, 16);
    g.fillStyle(0xcfe0ee, 1);
    g.fillEllipse(36, 48, 60, 14);
    g.fillStyle(0xeaf4fc, 1);
    g.fillEllipse(36, 46, 56, 11);
    g.lineStyle(2.5, 0x8aa7bd, 1);
    g.strokeEllipse(36, 50, 64, 16);

    // 大白饭堆：高出盆沿的白色饭团 + 阴影 + 米粒高光
    g.fillStyle(0xeae2d0, 0.9);
    g.fillEllipse(36, 44, 50, 12);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(36, 30, 20);
    g.fillStyle(0xfffdf6, 1);
    g.fillEllipse(36, 34, 44, 18);
    g.fillStyle(0xf2ecdc, 0.85);
    g.fillCircle(30, 24, 2.6);
    g.fillCircle(43, 22, 2.1);
    g.fillCircle(36, 28, 1.8);
    g.fillCircle(26, 32, 1.6);
    g.fillCircle(46, 33, 1.8);

    g.generateTexture('rice_bowl', 72, 64);
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
