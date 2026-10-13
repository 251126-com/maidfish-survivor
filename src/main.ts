// 游戏入口：Phaser 全局配置
// 横屏 1280x720 逻辑分辨率 + FIT 自适应，适配手机/PC 各种屏幕
import Phaser from 'phaser';
import { GAME_W, GAME_H } from './config/balance.ts';
import { BootScene } from './scenes/BootScene.ts';
import { MenuScene } from './scenes/MenuScene.ts';
import { GameScene } from './scenes/GameScene.ts';
import { ResultScene } from './scenes/ResultScene.ts';
import { sfx } from './core/audio.ts';
import { toggleFullscreen, isFullscreen, uaKind, type FsRequest } from './core/fullscreen.ts';
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
// ---------- v0.9.0 全屏适配（必须在用户手势内调用 Fullscreen API） ----------
//  - fullscreenchange / webkitfullscreenchange → game.scale.refresh() 重算 FIT 布局
//    （进入/退出全屏、用户按 F11/Esc 都会触发，画布尺寸变化后立即重排，避免黑边/拉伸）
//  - iOS Safari 不支持元素级全屏(video 除外)：点全屏按钮时给轻量 toast 提示
//  - 浏览器自动播放策略：任意首次用户手势统一解锁音频（菜单/游戏都成立）
const refreshScale = () => game.scale.refresh();
document.addEventListener('fullscreenchange', refreshScale);
document.addEventListener('webkitfullscreenchange', refreshScale);

// iOS 轻提示：临时 DOM toast（不干扰 Phaser，自动消失）
let fsToastEl: HTMLDivElement | null = null;
function fsToast(msg: string): void {
  if (fsToastEl) fsToastEl.remove();
  fsToastEl = document.createElement('div');
  fsToastEl.textContent = msg;
  fsToastEl.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:96px',
    'transform:translateX(-50%)', 'z-index:9999',
    'background:rgba(6,12,22,.92)', 'color:#ffd447',
    'border:1px solid #3d6c9e', 'border-radius:10px',
    'padding:10px 16px', 'font:14px monospace',
    'pointer-events:none', 'white-space:nowrap', 'user-select:none'
  ].join(';');
  document.body.appendChild(fsToastEl);
  window.setTimeout(() => { if (fsToastEl) { fsToastEl.remove(); fsToastEl = null; } }, 1800);
}

const unlockAudio = () => sfx.unlock();
window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
window.addEventListener('keydown', unlockAudio, { once: true });

// 全屏切换统一入口：供悬浮菜单按钮调用（返回结果给 UI 更新文案）
const FS_KIND = uaKind(navigator.userAgent);
(dbg as typeof dbg & { __FS?: { kind: string; toggle: () => FsRequest; isFullscreen: () => boolean } }).__FS = {
  kind: FS_KIND,
  isFullscreen: () => isFullscreen(),
  toggle: () => {
    const r = toggleFullscreen(document.getElementById('game'), FS_KIND);
    if (r === 'unsupported') fsToast('iOS 不支持全屏，请用浏览器自带全屏');
    else if (r === 'pending') fsToast('当前浏览器不支持全屏');
    return r;
  }
};
