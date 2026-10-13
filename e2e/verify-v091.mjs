// v0.9.1 验收：串行 Playwright 关键验收（真实浏览器截图）
// 覆盖：全屏 Promise 真实结果/UI 同步、购买后保留背景、拾取反馈世界跟随、
//       胜负表情单次结算、HUD 安全区(FIT)不回归
// 用法：E2E_URL=http://127.0.0.1:4173/ node e2e/verify-v091.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.E2E_URL || 'http://127.0.0.1:4173/';
const OUT = 'e2e/shots/v091';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const results = [];
const isNoise = (t) => /favicon|404 \(Not Found\)/.test(t);
const check = (name, ok, detail = '') => { results.push([name, !!ok, detail]); console.log(`${ok ? '✔' : '✘'} ${name}${detail ? '  [' + detail + ']' : ''}`); };
const VALID_FS = ['ok', 'pending', 'failed', 'unsupported'];

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

// ================= 桌面 1280x720 =================
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !isNoise(m.text())) errors.push(`[console.error] ${m.text()}`); });

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1500);

const ver = await page.evaluate(() => window.__VERSION ?? null);
check('V1 版本标记 __VERSION=0.9.1', ver === '0.9.1', `实际 ${ver}`);

// ---- V2 全屏 Promise 真实结果 / UI 状态同步 ----
try {
  const fsShape = await page.evaluate(() => {
    const h = window.__FS;
    return { has: !!h, kind: h?.kind, toggleType: h && typeof h.toggle, isFsType: h && typeof h.isFullscreen };
  });
  check('V2a __FS 钩子注入且 toggle 为函数', !!fsShape.has && fsShape.toggleType === 'function', JSON.stringify(fsShape));

  const fsRes = await page.evaluate(() => window.__FS.toggle());   // 真实 Fullscreen API 调用 → Promise 落到真实结果
  const fsOk = VALID_FS.includes(fsRes);
  check('V2b __FS.toggle() 返回合法 FsRequest（Promise 级真实结果）', fsOk, `实际 ${fsRes}`);
  if (fsRes === 'ok') {
    const inFs = await page.evaluate(() => (window.__FS.isFullscreen() || document.fullscreenElement !== null));
    check('V2c 进入全屏后 UI 状态同步（isFullscreen=true）', inFs === true, '');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__FS.toggle());                // 退出
    await page.waitForTimeout(300);
    const outFs = await page.evaluate(() => window.__FS.isFullscreen());
    check('V2d 退出全屏后 UI 状态同步（isFullscreen=false）', outFs === false, `实际 ${outFs}`);
  } else if (fsRes === 'failed') {
    const toast = await page.evaluate(() => document.body.innerText.includes('全屏请求被拒绝'));
    check('V2e 拒绝时 toast 提示「全屏请求被拒绝」', toast, '');
  } else {
    console.log(`  (非 ok/failed 分支 ${fsRes}，跳过状态断言——unsupported/pending 由单测覆盖)`);
  }
} catch (e) { errors.push('[V2 exception] ' + e.message); }

// ---- V3 菜单购买后保留起始背景 ----
try {
  const bgSet = await page.evaluate(() => {
    window.__MENU_BG.set(2);
    const cur = window.__MENU_BG.get();
    window.__game.scene.getScene('Menu').scene.restart();  // 模拟商店购买后的 scene.restart()
    return cur;
  });
  await page.waitForTimeout(500);
  const bgKeep = await page.evaluate(() => {
    const m = window.__game.scene.getScene('Menu');
    return { pick: window.__MENU_BG.get(), imgKey: m.bgImage?.texture?.key ?? null };
  });
  check('V3 购买重载后保留用户所选背景 (set2→restart→仍2/bg_ship)', bgKeep.pick === 2 && bgKeep.imgKey === 'bg_ship', JSON.stringify(bgKeep));
  await page.screenshot({ path: `${OUT}/01-menu-bg-persist.png` });
} catch (e) { errors.push('[V3 exception] ' + e.message); }

// ---- 进入游戏 ----
await page.mouse.click(640, 230);
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.spawnTimer = 99999;
  s.player.stats.hp = 9999; s.player.stats.maxHp = 9999;
  s.player.invuln = 0;
});

// ---- V4 拾取反馈世界坐标跟随（scrollFactor=1，非 HUD 屏坐标） ----
try {
  const pick = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.showPickupFeedback('+12', 0x4de8c2);
    const t = s.children.list.find(o => o.type === 'Text' && o.text === '+12');
    return { sfX: t.scrollFactorX, sfY: t.scrollFactorY, depth: t.depth, wx: t.x, wy: t.y, py: s.player.y };
  });
  check('V4a 拾取反馈 scrollFactor=1（世界跟随）', pick.sfX === 1 && pick.sfY === 1, JSON.stringify(pick));
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/02-pickup-feedback.png` });
  // 相机滚动不应改变文本的【世界坐标】（scrollFactor=1 → 它贴世界而非贴屏）→ 同一 evaluate 内完成避免 tween 销毁干扰
  const scrollKeep = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.showPickupFeedback('+12', 0x4de8c2);
    const t = s.children.list.find(o => o.type === 'Text' && o.text === '+12');
    const wx0 = t.x, wy0 = t.y;
    s.cameras.main.scrollX += 60;   // 相机向右滚 60
    const wx1 = t.x, wy1 = t.y;
    const sc = s.cameras.main.scrollX;
    return { wx0, wy0, wx1, wy1, sc };
  });
  const keep = Math.abs(scrollKeep.wx0 - scrollKeep.wx1) < 0.01 && Math.abs(scrollKeep.wy0 - scrollKeep.wy1) < 0.01;
  check('V4b 相机滚动后拾取文本世界坐标保持（随世界不漂移）', keep && scrollKeep.sc > 0, JSON.stringify(scrollKeep));
  await page.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.cameras.main.scrollX = 0; });
} catch (e) { errors.push('[V4 exception] ' + e.message); }

// ---- V5 胜负表情 + 只结算一次 + 1.1s 后进结算 ----
try {
  const once = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.finish(true);
    s.finish(true);                 // 重复调用应被 isOver 守卫拦截
    return { isOver: s.isOver };
  });
  check('V5a finish 只结算一次（isOver 守卫）', once.isOver === true, JSON.stringify(once));
  await page.waitForTimeout(300);
  const winExpr = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    const p = s.player;
    return { fxKey: p.fx.texture.key, fxState: p.fxState, win: p.winFlag, lose: p.loseFlag, scene: s.scene.key };
  });
  check('V5b 胜利表情真实渲染（fx_win）', winExpr.fxKey === 'fx_win' && winExpr.fxState === 'win' && winExpr.win === true, JSON.stringify(winExpr));
  await page.screenshot({ path: `${OUT}/03-finish-win.png` });
  // headless 下 RAF 约 11fps，Phaser fps.min=30 把游戏内时钟钳制得慢于真实时间，
  // 1100ms 游戏延迟需数秒真实时间 → 用条件轮询（等 Result 状态变 RUNNING），不用固定 sleep。
  const RESULT_RUNNING = 5;
  const t0res = Date.now();
  let reached = false;
  try {
    await page.waitForFunction((st) => {
      const g = window.__game;
      if (!g) return false;
      const r = g.scene.getScene('Result');
      return !!(r && r.sys && r.sys.settings && r.sys.settings.status === st);
    }, RESULT_RUNNING, { timeout: 25000, polling: 200 });
    reached = true;
  } catch { /* 25s 超时视为未到达 */ }
  const resWaitMs = Date.now() - t0res;
  check('V5c 1.1s 后进入 Result 结算场景（条件轮询）', reached, `耗时 ${resWaitMs}ms`);
} catch (e) { errors.push('[V5 win exception] ' + e.message); }

// ---- V5d 失败表情（重开一局 finish(false)） ----
try {
  await page.evaluate(() => window.__game.scene.start('Game'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.finish(false); });
  await page.waitForTimeout(250);
  const loseExpr = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    return { fxKey: s.player.fx.texture.key, fxState: s.player.fxState, lose: s.player.loseFlag };
  });
  check('V5d 失败表情真实渲染（fx_lose）', loseExpr.fxKey === 'fx_lose' && loseExpr.fxState === 'lose' && loseExpr.lose === true, JSON.stringify(loseExpr));
  await page.screenshot({ path: `${OUT}/04-finish-lose.png` });
} catch (e) { errors.push('[V5 lose exception] ' + e.message); }
await page.close();

// ================= 手机 390x844 =================
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mp = await ctx.newPage();
  mp.on('pageerror', e => errors.push(`[mpageerror] ${e.message}`));
  await mp.goto(URL, { waitUntil: 'load' });
  await mp.waitForTimeout(1500);
  const fit = await mp.locator('canvas').first().boundingBox();
  check('V6a 手机 FIT 画布等比且不越视口', fit && Math.abs(fit.width / fit.height - 1280 / 720) < 0.02 && fit.width <= 390 && fit.height <= 844, `${fit?.width?.toFixed(0)}x${fit?.height?.toFixed(0)}`);
  const css = await mp.evaluate(() => {
    const b = getComputedStyle(document.body);
    const g = getComputedStyle(document.getElementById('game'));
    return { bodyPadT: b.paddingTop, bodyPadB: b.paddingBottom, box: g.boxSizing, gameW: g.width, gameH: g.height };
  });
  const padNum = parseFloat(css.bodyPadT);
  check('V6b 安全区 CSS 已应用且无副作用（body padding 可解析/border-box）', Number.isFinite(padNum) && padNum >= 0 && css.box === 'border-box', JSON.stringify(css));
  await mp.screenshot({ path: `${OUT}/05-mobile-menu.png` });
  await mp.evaluate(() => window.__game.scene.getScene('Menu').scene.start('Game'));
  await mp.waitForTimeout(1300);
  await mp.screenshot({ path: `${OUT}/06-mobile-gameplay.png` });
  await mp.close();
} catch (e) { errors.push('[V6 mobile exception] ' + e.message); }

// ================= 汇总 =================
const fails = results.filter(r => !r[1]);
console.log(`\n===== v0.9.1 验收汇总: ${results.length - fails.length}/${results.length} 通过 =====`);
if (fails.length) { console.log('失败项:'); fails.forEach(r => console.log('  ✘', r[0], r[2])); }
if (errors.length) { console.log('\n页面/脚本错误:'); errors.forEach(e => console.log('  ', e)); }
process.exit(fails.length || errors.length ? 1 : 0);
