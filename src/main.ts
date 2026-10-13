// 游戏入口：Phaser 全局配置
// 横屏 1280x720 逻辑分辨率 + FIT 自适应，适配手机/PC 各种屏幕
import Phaser from 'phaser';
import { GAME_W, GAME_H } from './config/balance.ts';
import { BootScene } from './scenes/BootScene.ts';
import { MenuScene } from './scenes/MenuScene.ts';
import { GameScene } from './scenes/GameScene.ts';
import { ResultScene } from './scenes/ResultScene.ts';
import { sfx } from './core/audio.ts';
import { VERSION } from './config/version.ts';
import { BG_ORDER, BG_SWITCH_SEC } from './config/background.ts';
import { RICE_DROP_CHANCE, BOWL_DROP_CHANCE, RICE_HEAL, ARMOR_MAX } from './config/balance.ts';

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
const dbg = window as unknown as {
  __game: Phaser.Game;
  __sfx: typeof sfx;
  __VERSION: string;
  __BG_MARK: { version: string; count: number; keys: string[]; names: string[]; switchSec: number };
  __BG_STATE: { version: string; activeIndex: number; activeKey: string; activeName: string; };
  __LOOT_MARK: { version: string; riceChance: number; bowlChance: number; riceHeal: number; armorMax: number };
  // E2E/调试钩子：注入 __DROP_RNG 可受控掷特殊掉落（未设置时用 Math.random）
  __DROP_RNG?: () => number;
};
dbg.__game = game;
dbg.__sfx = sfx;
dbg.__VERSION = VERSION;   // 部署验证标记：线上能读到它就说明新版本已上线
// 背景部署标记：版本 + 四张授权背景键。线上校验时确认资源与构建一致
dbg.__BG_MARK = {
  version: VERSION,
  count: BG_ORDER.length,
  keys: BG_ORDER.map(p => p.key),
  names: BG_ORDER.map(p => p.name),
  switchSec: BG_SWITCH_SEC
};
// 当前局实时背景状态：GameScene 每帧或切换时更新，供 e2e/线上校验读取
dbg.__BG_STATE = { version: VERSION, activeIndex: -1, activeKey: '', activeName: '' };
// 特殊掉落部署标记：版本 + 掉落概率/回血/护甲常量。线上校验确认新玩法已上线
dbg.__LOOT_MARK = {
  version: VERSION,
  riceChance: RICE_DROP_CHANCE,
  bowlChance: BOWL_DROP_CHANCE,
  riceHeal: RICE_HEAL,
  armorMax: ARMOR_MAX
};