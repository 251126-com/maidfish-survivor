// 虚拟摇杆 + 受击屏幕震动 端到端验证
// 用法：CHROME_PATH=/usr/bin/chromium E2E_URL=http://127.0.0.1:4173/ node e2e/verify-joystick.mjs
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('console', m => {
  if (m.type() === 'error' && !isNoise(m.text())) errors.push(`[console.error] ${m.text()}`);
});

const joy = () => page.evaluate(() => {
  const s = window.__game?.scene?.getScene('Game');
  return s?.inputSys ? s.inputSys.joystick : null;
});

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.mouse.click(640, 230);          // 开始游戏
await page.waitForTimeout(1200);

// ---------- 场景 1：满速拖动，摇杆可见且摇杆头钳制在环上 ----------
console.log('→ 场景1：满速拖动时应显示摇杆');
await page.mouse.move(640, 420);
await page.mouse.down();
await page.mouse.move(900, 420, { steps: 10 });   // 拖 260px，远超 72 半径
await page.waitForTimeout(150);
const j1 = await joy();
console.log('   摇杆状态:', JSON.stringify(j1));
const j1ok = !!j1 && j1.active === true
  && Math.abs(j1.baseX - 640) < 1 && Math.abs(j1.baseY - 420) < 1
  && Math.abs(j1.knobX - (640 + 72)) < 2 && Math.abs(j1.knobY - 420) < 2
  && Math.abs(j1.magnitude - 1) < 0.02
  && j1.dirX > 0.98;
await page.screenshot({ path: `${OUT}/20-joystick-drag.png` });

// 拖动确实让玩家移动（对比拖动前后的 X）
const pxBefore = await page.evaluate(() => window.__game.scene.getScene('Game').player.x);
await page.waitForTimeout(300);   // 让移动跑几帧
const pxAfter = await page.evaluate(() => window.__game.scene.getScene('Game').player.x);
const moved = pxAfter - pxBefore;

// ---------- 场景 2：松手后摇杆消失 ----------
console.log('→ 场景2：松手后摇杆隐藏');
await page.mouse.up();
await page.waitForTimeout(120);
const j2 = await joy();
console.log('   松手后:', JSON.stringify(j2));
const j2ok = j2 === null;

// ---------- 场景 3：半速拖动的幅度 ----------
console.log('→ 场景3：半速拖动幅度≈0.5');
await page.mouse.move(400, 300);
await page.mouse.down();
await page.mouse.move(436, 300, { steps: 4 });   // 36px = 一半半径
await page.waitForTimeout(120);
const j3 = await joy();
console.log('   半速状态:', JSON.stringify(j3));
const j3ok = !!j3 && Math.abs(j3.magnitude - 0.5) < 0.05;
await page.mouse.up();
await page.waitForTimeout(100);

// ---------- 场景 4：受击触发屏幕震动 ----------
console.log('→ 场景4：受击应触发相机震动（走真实碰撞路径）');
const shake = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  // 保命并清无敌，把一只鱼放到玩家身上，走 collideEnemyPlayer 真实路径
  s.stats.hp = s.stats.maxHp;
  s.player.invuln = 0;
  const before = s.cameras.main.shakeEffect.isRunning;
  const e = s.enemies.spawn('fish', s.player.x, s.player.y, s.elapsed);
  let took = false;
  if (e) {
    const hpBefore = s.stats.hp;
    s.collideEnemyPlayer();
    took = s.stats.hp < hpBefore || s.player.invuln > 0;
    s.enemies.pool.release(e);
  }
  const running = s.cameras.main.shakeEffect.isRunning;
  // 补偿回血，避免影响后续
  s.stats.hp = s.stats.maxHp;
  s.player.invuln = 0.6;
  return { before, took, running };
});
console.log('   震动结果:', JSON.stringify(shake));
const shakeOk = shake.before === false && shake.took === true && shake.running === true;

// ---------- 场景 5：Boss 出场应触发震动 ----------
console.log('→ 场景5：Boss 出场应触发震动');
const bossShake = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.bossSpawned = true;   // 假装已刷过，只测震动映射本身不便；改走直接调用
  // 直接模拟 GameScene 里 Boss 分支的调用
  s.cameras.main.shakeEffect.reset();
  s.bossSpawned = false;
  s.elapsed = 600;
  s.updateSpawner(0.016);
  return { running: s.cameras.main.shakeEffect.isRunning, bossSpawned: s.bossSpawned };
});
console.log('   Boss 震动:', JSON.stringify(bossShake));
const bossShakeOk = bossShake.running === true && bossShake.bossSpawned === true;
await page.screenshot({ path: `${OUT}/21-after-boss-shake.png` });

// ---------- 常规运行回归 ----------
await page.waitForTimeout(1500);
const s1 = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { elapsed: Number(s.elapsed.toFixed(1)), enemies: s.enemies.count, bullets: s.weapons.bulletCount, kills: s.kills };
});
console.log('   常规运行:', JSON.stringify(s1));

await browser.close();

const checks = [
  ['满速拖动时摇杆可见，摇杆头钳制在环上', j1ok],
  ['拖动确实让玩家移动', moved > 10],
  ['松手后摇杆隐藏', j2ok],
  ['半速拖动幅度≈0.5', j3ok],
  ['受击触发相机震动', shakeOk],
  ['Boss 出场触发相机震动', bossShakeOk],
  ['游戏正常运行（时间推进/刷怪/开火）', s1.elapsed > 1 && s1.enemies > 0 && s1.bullets > 0],
  ['无 JS 运行时错误', errors.length === 0]
];

console.log('\n===== 摇杆+震动验证 =====');
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
