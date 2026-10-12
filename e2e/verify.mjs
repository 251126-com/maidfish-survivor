// 端到端验证脚本：真浏览器里跑一遍，读游戏内部状态，截图留证
// 用法：CHROME_PATH=/usr/bin/chromium node e2e/verify.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.E2E_URL || 'http://127.0.0.1:4173/';
const OUT = 'e2e/shots';
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const log = (...a) => console.log(...a);

// 资源 404（favicon 等）不算游戏运行错误，单独归类
const isNoise = (t) => /favicon|404 \(Not Found\)/.test(t);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('console', m => {
  if (m.type() === 'error' && !isNoise(m.text())) errors.push(`[console.error] ${m.text()}`);
});

const readState = () => page.evaluate(() => {
  const s = window.__game?.scene?.getScene('Game');
  if (!s || !s.scene.isActive()) return { sceneActive: false };
  return {
    sceneActive: true,
    elapsed: Number(s.elapsed.toFixed(2)),
    enemies: s.enemies.count,
    bullets: s.weapons.bulletCount,
    kills: s.kills,
    hp: Math.round(s.stats.hp),
    playerX: Math.round(s.player.x),
    playerY: Math.round(s.player.y),
    level: s.levelSys.level,
    pending: s.levelSys.pending,
    gold: s.gold
  };
});

log('→ 打开页面');
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/01-menu.png` });

const canvasOk = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  return !!c && c.width > 0 && c.height > 0;
});
log(`   canvas 存在且有尺寸: ${canvasOk}`);

log('→ 点击开始游戏');
await page.mouse.click(640, 230);
await page.waitForTimeout(2000);
const s0 = await readState();
log('   开局状态:', JSON.stringify(s0));
await page.screenshot({ path: `${OUT}/02-game-start.png` });

log('→ 模拟拖动移动（按住并向右拖）');
await page.mouse.move(640, 420);
await page.mouse.down();
await page.mouse.move(820, 420, { steps: 8 });
await page.waitForTimeout(2000);
const sMid = await readState();
await page.mouse.up();
log(`   拖动后玩家X: ${s0.playerX} → ${sMid.playerX}`);
const moved = sMid.playerX > s0.playerX + 20;

log('→ 挂机 6 秒观察刷怪/自动开火');
await page.waitForTimeout(6000);
const s1 = await readState();
log('   6秒后:', JSON.stringify(s1));
await page.screenshot({ path: `${OUT}/03-game-running.png` });

// 击杀验证：把场上敌人拉到玩家身边，几帧内必然被子弹打死
log('→ 把敌人拉到玩家身边，验证击杀与掉落');
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const live = s.enemies.live;
  for (let i = 0; i < live.length; i++) {
    live[i].x = s.player.x + 60;
    live[i].y = s.player.y;
  }
});
await page.waitForTimeout(3500);
const sKill = await readState();
log('   拉近后:', JSON.stringify(sKill));
const killedSomething = sKill.kills > 0;
await page.screenshot({ path: `${OUT}/04-after-kill.png` });

// 升级面板：只注入"刚好升一级"的经验，避免一次升 20 级
log('→ 注入刚好一级的经验，触发三选一');
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.levelSys.addXp(s.levelSys.need, 1);
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/05-levelup-panel.png` });
const panelVisible = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { visible: s.panel.visible, pending: s.levelSys.pending, level: s.levelSys.level };
});
log('   面板状态:', JSON.stringify(panelVisible));

// 点第一张卡（逻辑坐标 280, 390，viewport 与逻辑分辨率 1:1）
log('→ 点击第一张升级卡');
await page.mouse.click(280, 390);
await page.waitForTimeout(700);
const afterPick = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return {
    panelVisible: s.panel.visible,
    pending: s.levelSys.pending,
    weapons: s.weapons.owned.map(w => `${w.def.id}Lv${w.level}`)
  };
});
log('   选择后:', JSON.stringify(afterPick));
await page.screenshot({ path: `${OUT}/06-after-pick.png` });

log('→ 采样帧率（无头软件渲染，仅作参考）');
const fps = await page.evaluate(() => new Promise(res => {
  let frames = 0;
  const t0 = performance.now();
  const tick = () => {
    frames++;
    if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
    else res(Math.round((frames * 1000) / (performance.now() - t0)));
  };
  requestAnimationFrame(tick);
}));
log(`   帧率: ${fps} fps`);

const s2 = await readState();
log('   最终状态:', JSON.stringify(s2));
await page.screenshot({ path: `${OUT}/07-final.png` });

await browser.close();

const checks = [
  ['canvas 渲染正常', canvasOk],
  ['进入游戏场景', s0.sceneActive === true],
  ['拖动使玩家移动', moved],
  ['游戏时间推进', s1.elapsed > s0.elapsed],
  ['自动刷怪', s1.enemies > 0],
  ['自动开火', s1.bullets > 0],
  ['击杀敌人', killedSomething],
  ['升级面板弹出', panelVisible.visible === true],
  ['选择后升级被消耗', afterPick.pending < panelVisible.pending],
  ['面板未异常卡死', afterPick.panelVisible === false],
  ['无 JS 运行时错误', errors.length === 0]
];

console.log('\n===== 验证结果 =====');
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