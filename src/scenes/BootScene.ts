// 启动场景：用代码绘制所有占位贴图（无需美术资源即可跑通）
// 所有纹理在内存里生成，后续换正式图集时只替换 key 对应的贴图即可
import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create(): void {
    this.makeBackground();
    this.makePlayer();
    this.makeEnemies();
    this.makeProjectiles();
    this.makeDrops();
    this.scene.start('Menu');
  }

  // 背景网格瓦片 64x64
  private makeBackground(): void {
    const g = this.add.graphics();
    g.fillStyle(0x0e1a2b, 1);
    g.fillRect(0, 0, 64, 64);
    g.lineStyle(1, 0x16283f, 1);
    g.strokeRect(0.5, 0.5, 63, 63);
    g.fillStyle(0x16283f, 1);
    g.fillCircle(32, 32, 1.5);
    g.generateTexture('bg_tile', 64, 64);
    g.destroy();
  }

  // 主角：蓝发女仆装 + 鲨鱼尾，面朝右（48x48）
  private makePlayer(): void {
    const g = this.add.graphics();

    // 鲨鱼尾（身后，左侧）
    g.fillStyle(0x7fd4ff, 1);
    g.fillTriangle(16, 26, 1, 14, 1, 38);
    g.fillStyle(0xc8f2ff, 1);
    g.fillTriangle(15, 26, 5, 19, 5, 33);

    // 女仆裙
    g.fillStyle(0x2f4470, 1);
    g.fillRoundedRect(14, 28, 22, 17, 6);
    // 白色围裙
    g.fillStyle(0xf4f8ff, 1);
    g.fillRoundedRect(19, 32, 13, 13, 4);
    // 领结
    g.fillStyle(0x63b9ff, 1);
    g.fillTriangle(25, 28, 21, 25, 21, 31);
    g.fillTriangle(25, 28, 29, 25, 29, 31);

    // 头
    g.fillStyle(0xffe3d0, 1);
    g.fillCircle(25, 18, 11);
    // 蓝发
    g.fillStyle(0x63b9ff, 1);
    g.fillCircle(25, 12, 12);
    g.fillRect(13, 11, 24, 9);
    // 呆毛
    g.fillTriangle(25, 1, 21, 10, 29, 10);
    // 眼睛
    g.fillStyle(0x1b2a44, 1);
    g.fillCircle(21, 19, 2.2);
    g.fillCircle(29, 19, 2.2);
    // 腮红
    g.fillStyle(0xffb3b3, 0.85);
    g.fillCircle(17, 22, 2.2);
    g.fillCircle(33, 22, 2.2);

    g.generateTexture('player_maid', 48, 48);
    g.destroy();
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

    // 鲨尾环绕鳍
    g = this.add.graphics();
    g.fillStyle(0x8fe6ff, 0.95);
    g.fillTriangle(0, 14, 22, 2, 22, 26);
    g.fillStyle(0xd8f6ff, 0.9);
    g.fillTriangle(4, 14, 18, 7, 18, 21);
    g.generateTexture('fin', 22, 28);
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
  }
}