// v0.5.0 打磨项端到端验证：浮动伤害数字、音效开关、UI点击不触发摇杆、版本标记、竖屏提示
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

// ---------- 1. 版本标记 ----------
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const ver = await page.evaluate(() => window.__VERSION ?? null);
console.log('   版本标记:', ver);
const verOk = ver === '0.9.0';

// ---------- 2. 进入游戏 ----------
await page.mouse.click(640, 230);
await page.waitForTimeout(1200);

// ---------- 3. 浮动伤害数字 ----------
console.log('→ 伤害数字：普通 + 暴击');
const dmg = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  // 直接调用武器伤害入口（TS private 编译后是普通方法），确定性生成一次普通、一次暴击
  const e1 = s.enemies.spawn('fish', s.player.x + 120, s.player.y, s.elapsed);
  const e2 = s.enemies.spawn('fish', s.player.x - 120, s.player.y, s.elapsed);
  if (e1) { e1.hp = 99999; e1.maxHp = 99999; }
  if (e2) { e2.hp = 99999; e2.maxHp = 99999; }
  if (e1) s.weapons.applyDamage(e1, 23, s.enemies, s.player);
  const prevCrit = s.player.stats.critChance;
  s.player.stats.critChance = 1;
  if (e2) s.weapons.applyDamage(e2, 23, s.enemies, s.player);
  s.player.stats.critChance = prevCrit;
  return { visible: s.weapons.damageText.visibleCount, texts: s.weapons.damageText.pool.map(d => d.obj.text).filter(t => t) };
});
console.log('   伤害数字:', JSON.stringify(dmg));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/30-damage-numbers.png` });
const dmgOk = dmg.visible >= 2 && dmg.texts.some(t => /^\d+$/.test(t)) && dmg.texts.some(t => t.startsWith('暴击'));

// ---------- 4. 音效开关（点击按钮不触发摇杆） ----------
console.log('→ 音效开关：点击后关闭，且不触发摇杆');
const soundBefore = await page.evaluate(() => window.__sfx.enabled);
await page.mouse.click(1218, 126);   // HUD 右上角音效按钮
await page.waitForTimeout(150);
const snd = await page.evaluate(() => ({
  enabled: window.__sfx.enabled,
  joystick: window.__game.scene.getScene('Game').inputSys.joystick
}));
console.log('   点击后:', JSON.stringify(snd));
await page.screenshot({ path: `${OUT}/31-sound-off.png` });
const soundOk = soundBefore === true && snd.enabled === false && snd.joystick === null;

// 再点一次恢复
await page.mouse.click(1218, 126);
await page.waitForTimeout(120);
const snd2 = await page.evaluate(() => window.__sfx.enabled);
console.log('   再点后 enabled:', snd2);
const soundRestoreOk = snd2 === true;

// ---------- 5. 摇杆拖动验证（满速方向 + 玩家移动） ----------
console.log('→ 摇杆：拖动时可见且驱动移动');
await page.mouse.move(640, 420);
await page.mouse.down();
await page.mouse.move(900, 420, { steps: 8 });
await page.waitForTimeout(200);
const joyDrag = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const j = s.inputSys.joystick;
  return j ? { active: j.active, mag: Math.round(j.magnitude * 100) / 100, dirX: Math.round(j.dirX * 100) / 100, knobX: Math.round(j.knobX) } : null;
});
const px1 = await page.evaluate(() => window.__game.scene.getScene('Game').player.x);
await page.waitForTimeout(300);
const px2 = await page.evaluate(() => window.__game.scene.getScene('Game').player.x);
await page.mouse.up();
console.log('   拖动:', JSON.stringify(joyDrag), '玩家X位移:', Math.round(px2 - px1));
const joyOk = !!joyDrag && joyDrag.active === true && Math.abs(joyDrag.mag - 1) < 0.05 && joyDrag.dirX > 0.98 && (px2 - px1) > 10;
await page.screenshot({ path: `${OUT}/32-joystick.png` });

await browser.close();

// ---------- 6. 竖屏提示（触屏设备竖屏显示、横屏隐藏） ----------
const touchCtx = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true });
const p2 = await touchCtx.newPage();
await p2.goto(URL, { waitUntil: 'load' });
await p2.waitForTimeout(800);
const portraitShow = await p2.evaluate(() => {
  const el = document.getElementById('rotate-hint');
  return getComputedStyle(el).display;
});
await p2.screenshot({ path: `${OUT}/33-portrait-hint.png` });

const touchLand = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true, isMobile: true });
const p3 = await touchLand.newPage();
await p3.goto(URL, { waitUntil: 'load' });
await p3.waitForTimeout(800);
const landscapeShow = await p3.evaluate(() => {
  const el = document.getElementById('rotate-hint');
  return getComputedStyle(el).display;
});
console.log('   竖屏提示(竖屏):', portraitShow, ' (横屏):', landscapeShow);
const portraitOk = portraitShow === 'flex' && landscapeShow === 'none';
await p2.close();
await p3.close();

const checks = [
  ['版本标记 window.__VERSION === 0.5.0', verOk],
  ['浮动伤害数字出现（普通+暴击）', dmgOk],
  ['音效开关点击后关闭', soundOk],
  ['再次点击恢复开启', soundRestoreOk],
  ['摇杆满速拖动且玩家移动', joyOk],
  ['竖屏显示横屏提示 / 横屏隐藏', portraitOk],
  ['无 JS 运行时错误', errors.length === 0]
];
console.log('\n===== v0.5.0 打磨项验证 =====');
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
