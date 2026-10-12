// 游戏入口：Phaser 全局配置
// 横屏 1280x720 逻辑分辨率 + FIT 自适应，适配手机/PC 各种屏幕
import Phaser from 'phaser';
import { GAME_W, GAME_H } from './config/balance.ts';
import { BootScene } from './scenes/BootScene.ts';
import { MenuScene } from './scenes/MenuScene.ts';
import { GameScene } from './scenes/GameScene.ts';
import { ResultScene } from './scenes/ResultScene.ts';
import { sfx } from './core/audio.ts';

const game = new Phaser.Game({
  type: Phaser.AUTO,          // 优先 WebGL，不支持自动降级 Canvas
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#0a1420',
  scale: {
    mode: Phaser.Scale.FIT,               // 等比缩放铺满，不裁剪
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false
  },
  fps: { target: 60, min: 30 },
  // 关闭自带物理引擎——碰撞由空间哈希自写，省开销
  scene: [BootScene, MenuScene, GameScene, ResultScene]
});

// 暴露实例：便于浏览器调试与自动化验证（读场景内部状态）
const dbg = window as unknown as { __game: Phaser.Game; __sfx: typeof sfx };
dbg.__game = game;
dbg.__sfx = sfx;