// 手机端到端验证：竖屏视口 + 真实触摸（CDP Input.dispatchTouchEvent 走浏览器真实触摸管线）
// 覆盖：视口 FIT 缩放、触摸启动、触摸拖动移动 + 摇杆可见、升级卡触摸选择、失败→重开、版本标记
// 用法：CHROME_PATH=/usr/bin/chromium E2E_URL=http://127.0.0.1:4173/ node e2e/verify-mobile.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.E2E_URL || 'http://127.0.0.1:4173/';
const OUT = 'e2e/shots';
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const isNoise = (t) => /favicon|404 \(Not Found\)/.test(t);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2
});
const page = await context.newPage();
const client = await context.newCDPSession(page);
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('console', m => {
  if (m.type() === 'error' && !isNoise(m.text())) errors.push(`[console.error] ${m.text()}`);
});

// 逻辑坐标(1280x720) → 屏幕坐标：FIT 等比缩放 + letterbox 居中
const map = async (lx, ly) => {
  const box = await page.locator('canvas').first().boundingBox();
  return { x: box.x + (lx / 1280) * box.width, y: box.y + (ly / 720) * box.height };
};

const touch = async (type, pts) => {
  await client.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
};

const tap = async (lx, ly) => {
  const p = await map(lx, ly);
  await touch('touchStart', [{ x: p.x, y: p.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }]);
  await page.waitForTimeout(40);
  await touch('touchEnd', []);
  await page.waitForTimeout(120);
};

// 按下并拖到目标点，保持按住不松开（供检查摇杆状态）
const dragHold = async (lx0, ly0, lx1, ly1, steps = 6) => {
  const a = await map(lx0, ly0);
  const b = await map(lx1, ly1);
  await touch('touchStart', [{ x: a.x, y: a.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }]);
  await page.waitForTimeout(60);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await touch('touchMove', [{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, id: 1, radiusX: 2, radiusY: 2, force: 1 }]);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(120);
};

const gameState = () => page.evaluate(() => {
  const gm = window.__game;
  const s = gm?.scene?.getScene('Game');
  if (!s || !s.scene.isActive()) return { activeScene: gm?.scene?.getScenes(true)[0]?.scene?.key ?? null };
  return {
    activeScene: 'Game',
    elapsed: Number(s.elapsed.toFixed(1)),
    enemies: s.enemies.count,
    bullets: s.weapons.bulletCount,
    kills: s.kills,
    hp: Math.round(s.stats.hp),
    playerX: Math.round(s.player.x),
    playerY: Math.round(s.player.y),
    joystick: s.inputSys.joystick
  };
});

console.log('→ 打开页面（竖屏 390x844，真实触摸）');
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1800);
const ver = await page.evaluate(() => window.__VERSION);
console.log('  window.__VERSION =', ver);

// ---------- 检查 1：FIT 缩放，画布完整落在视口内 ----------
const box = await page.locator('canvas').first().boundingBox();
const ratio = box.width / box.height;
const fitOk = Math.abs(ratio - 1280 / 720) < 0.02 && box.width <= 390 && box.height <= 844;
console.log(`  canvas=${box.width.toFixed(0)}x${box.height.toFixed(0)} ratio=${ratio.toFixed(3)}（期望≈1.778）`);
await page.screenshot({ path: `${OUT}/30-mobile-menu.png` });

// ---------- 检查 2：触摸启动（点开始按钮，同时解锁音频） ----------
await tap(640, 230);
await page.waitForTimeout(1200);
const s0 = await gameState();
console.log('  触摸开始后场景:', JSON.stringify(s0));
const startOk = s0.activeScene === 'Game' && s0.enemies > 0 && s0.bullets > 0;

// ---------- 检查 3：触摸拖动移动 + 摇杆可见 ----------
const px0 = s0.playerX, py0 = s0.playerY;
await dragHold(640, 420, 420, 240);   // 左上方向拖动
const joyWhile = await page.evaluate(() => window.__game.scene.getScene('Game').inputSys.joystick);
const sMove = await gameState();
await touch('touchEnd', []);
await page.waitForTimeout(150);
console.log('  拖动中摇杆:', JSON.stringify(joyWhile));
console.log('  移动前(%d,%d) → 移动后(%d,%d)', px0, py0, sMove.playerX, sMove.playerY);
const joyOk = !!joyWhile && joyWhile.active === true
  && Math.abs(joyWhile.baseX - 640) < 1 && Math.abs(joyWhile.baseY - 420) < 1
  && joyWhile.magnitude > 0.9
  && joyWhile.dirX < -0.9 && joyWhile.dirY < -0.4;   // 左上方向
const moveOk = (sMove.playerX - px0) < -20 && (sMove.playerY - py0) < -20;
const joyGoneOk = (await gameState()).joystick === null;   // 松手后消失
await page.screenshot({ path: `${OUT}/31-mobile-drag.png` });

// ---------- 检查 4：升级卡触摸选择 ----------
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.levelSys.addXp(s.levelSys.need, 1);   // 触发一次升级
});
await page.waitForTimeout(900);
const panelUp = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { visible: s.panel.visible, cards: s.panel.cards.map(c => c.name.text) };
});
console.log('  升级面板:', JSON.stringify(panelUp));
const panelOk = panelUp.visible === true && panelUp.cards.filter(Boolean).length >= 1;
await tap(280, 390);   // 点第一张卡
await page.waitForTimeout(900);
const panelAfter = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { visible: s.panel.visible, pending: s.levelSys.pending, weapons: s.weapons.owned.map(w => `${w.def.id}Lv${w.level}`) };
});
console.log('  选卡后:', JSON.stringify(panelAfter));
const cardOk = panelAfter.visible === false && panelAfter.pending === 0;
await page.screenshot({ path: `${OUT}/32-mobile-levelup.png` });

// ---------- 检查 5：失败 → 结算 → 触摸重开 ----------
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.stats.hp = 0;   // 直接归零触发死亡
});
await page.waitForTimeout(700);
const sceneKey1 = await page.evaluate(() => window.__game.scene.getScenes(true)[0].scene.key);
console.log('  死亡后场景:', sceneKey1);
const loseOk = sceneKey1 === 'Result';
await tap(490, 520);   // "再来一局"
await page.waitForTimeout(1200);
const sceneKey2 = await page.evaluate(() => window.__game.scene.getScenes(true)[0].scene.key);
const sRestart = await gameState();
console.log('  重开后场景:', sceneKey2, '状态:', JSON.stringify(sRestart));
const restartOk = sceneKey2 === 'Game' && sRestart.hp > 0 && sRestart.elapsed < 3;

// ---------- 常规运行回归 ----------
await page.waitForTimeout(1200);
const s2 = await gameState();
console.log('  常规运行:', JSON.stringify(s2));
const runOk = s2.activeScene === 'Game' && s2.elapsed > 1 && s2.enemies > 0 && s2.bullets > 0;

await browser.close();

const checks = [
  ['页面加载版本标记 __VERSION=0.5.0', ver === '0.5.1'],
  ['FIT 缩放：画布长宽比≈16:9 且完整在视口内', fitOk],
  ['触摸点开始游戏并进入战斗（刷怪/开火）', startOk],
  ['触摸拖动时摇杆可见且方向正确（左上）', joyOk],
  ['触摸拖动确实移动玩家', moveOk],
  ['松手后摇杆消失', joyGoneOk],
  ['升级面板出现且卡牌可触摸选择', panelOk && cardOk],
  ['失败进入结算页', loseOk],
  ['结算页触摸"再来一局"回到新对局', restartOk],
  ['游戏正常运行（时间推进/刷怪/开火）', runOk],
  ['无 JS 运行时错误', errors.length === 0]
];

console.log('\n===== 手机端验证 =====');
let allPass = true;
for (const [name, ok] of checks) {
  console.log(`${ok ? '✔' : '✘'} ${name}`);
  if (!ok) allPass = false;
}
if (errors.length) {
  console.log('\n捕获到的错误:');
  for (const e of errors.slice(0, 10)) console.log('  ' + e);
}
console.log(`\n结论: ${allPass ? '全部通过' : '存在失败项'}`);
process.exit(allPass ? 0 : 1);
