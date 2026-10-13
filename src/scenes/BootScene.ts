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
}