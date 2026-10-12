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

  // 主角：鲸鱼娘 —— 白蓝配色、横向鲸尾、蓝发呆毛（56x56）
  private makePlayer(): void {
    const g = this.add.graphics();

    // 鲸鱼尾鳍（横向，身后左侧）—— 鲸类特征
    g.fillStyle(0x8fd8ff, 1);
    g.fillTriangle(2, 18, 20, 30, 2, 30);
    g.fillTriangle(2, 42, 20, 30, 2, 30);
    g.fillStyle(0xd8f2ff, 0.9);
    g.fillTriangle(6, 23, 17, 30, 6, 30);
    g.fillTriangle(6, 37, 17, 30, 6, 30);

    // 白色连衣裙
    g.fillStyle(0xf2f8ff, 1);
    g.fillRoundedRect(20, 34, 20, 19, 7);
    // 裙摆蓝色滚边
    g.fillStyle(0x7fc8ff, 1);
    g.fillRoundedRect(20, 48, 20, 5, 2);

    // 领结
    g.fillStyle(0x63b9ff, 1);
    g.fillTriangle(30, 35, 26, 32, 26, 38);
    g.fillTriangle(30, 35, 34, 32, 34, 38);

    // 头
    g.fillStyle(0xffe3d0, 1);
    g.fillCircle(30, 22, 12);

    // 蓝发 + 刘海
    g.fillStyle(0x7fc8ff, 1);
    g.fillCircle(30, 15, 13);
    g.fillRect(17, 14, 26, 10);

    // 呆毛
    g.fillTriangle(30, 1, 26, 11, 34, 11);

    // 眼睛
    g.fillStyle(0x1b2a44, 1);
    g.fillCircle(25, 23, 2.5);
    g.fillCircle(35, 23, 2.5);

    // 腮红
    g.fillStyle(0xffb3b3, 0.85);
    g.fillCircle(21, 26, 2.5);
    g.fillCircle(39, 26, 2.5);

    g.generateTexture('player_whale', 56, 56);
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
  }
}