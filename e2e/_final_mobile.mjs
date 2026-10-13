// v0.10.0 手机横屏真实验收（本地 dist）：录制 webm + 连续截图 → final/mobile
// 与桌面 experience_review 分开目录，标注 source=local/online
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SOURCE = process.env.MOBILE_SOURCE || 'local';
const URL = SOURCE === 'local' ? 'http://127.0.0.1:4173/' : 'https://251126-com.github.io/maidfish-survivor/';
const OUT = `e2e/shots/experience-review/final/mobile-${SOURCE}`;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const V = { label: 'final-mobile', source: SOURCE, startedAt: new Date().toISOString(), ui: 'phone-landscape 844x390' };
const tl = [], errs = [];
let t0 = 0, sh = 0;
const wall = () => +((Date.now() - t0) / 1000).toFixed(1);

const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, recordVideo: { dir: OUT, size: { width: 844, height: 390 } } });
const page = await ctx.newPage();
page.on('pageerror', e => errs.push('PAGE:' + String(e.message || e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE:' + m.text().slice(0, 200)); });
page.on('requestfailed', r => errs.push('REQFAIL:' + r.url().slice(-80) + ' :: ' + (r.failure()?.errorText || '')));

const snap = () => page.evaluate(() => {
  const out = {};
  try {
    const g = window.__game, s = g?.scene?.getScene('Game');
    out.v = window.__VERSION; out.bg = window.__BG_STATE?.activeName ?? null;
    if (!s || !s.player) { out.scene = false; return out; }
    out.scene = true; out.fps = Math.round(g.loop.actualFps || 0);
    out.elapsed = +s.elapsed.toFixed(1); out.orient = window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
    out.hp = Math.round(s.player.stats.hp); out.maxHp = Math.round(s.player.stats.maxHp);
    out.level = s.levelSys?.level ?? 0; out.kills = s.kills; out.enemies = s.enemies?.count ?? 0;
    out.panel = !!s.panel?.visible; out.boss = s.bossEnemy ? { st: s.bossBrain?.state, sk: s.bossBrain?.currentSkill } : null;
    out.armor = Math.round(s.player.armorValue ?? 0);
    return out;
  } catch (e) { out.err = String(e).slice(0, 150); return out; }
});
const shot = async (tag) => {
  sh++;
  const f = `${String(sh).padStart(2, '0')}_${tag}.png`;
  await page.screenshot({ path: path.join(OUT, f) });
  tl.push({ w: wall(), type: 'shot', f });
  return f;
};
const log = async (type, note) => { tl.push({ w: wall(), type, note, s: await snap() }); };

t0 = Date.now();
const nav0 = Date.now();
try { await page.goto(URL, { waitUntil: 'load', timeout: 45000 }); } catch (e) { errs.push('NAV:' + String(e).slice(0, 160)); }
V.loadMs = Date.now() - nav0;
await page.waitForTimeout(2500);
await shot('m01-menu'); await log('menu', `source=${SOURCE} loadMs=${V.loadMs}`);

// 触屏开始（844x390 逻辑坐标）
await page.touchscreen.tap(Math.round(844 * 0.5), Math.round(390 * 0.30));
await page.waitForTimeout(1800);
await shot('m02-game-start'); await log('start', '开局画面');
// 摇杆画圈 + 自动开火
const cx = Math.round(844 * 0.18), cy = Math.round(390 * 0.8);
await page.touchscreen.tap(cx, cy);
await page.waitForTimeout(400);
await page.mouse.move(cx, cy); await page.mouse.down();
for (let i = 0; i < 6; i++) { await page.mouse.move(cx + 90, cy - 40, { steps: 8 }); await page.waitForTimeout(300); await page.mouse.move(cx - 90, cy + 40, { steps: 8 }); await page.waitForTimeout(300); }
await page.mouse.up();
await shot('m03-joystick'); await log('move', '摇杆移动+自动开火');
// 等首次升级面板（最多 50s）
let got = false, lvAt = -1;
for (let i = 0; i < 100; i++) {
  const s = await snap();
  if (s.panel) { got = true; lvAt = wall(); break; }
  if (i % 10 === 0) { await page.touchscreen.tap(cx + (i % 2 ? 90 : -90), cy - 40); await page.waitForTimeout(300); }
  await page.waitForTimeout(500);
}
await shot(got ? 'm04-first-levelup' : 'm04-levelup-timeout');
await log('levelup', got ? `首次升级面板 ${lvAt}s` : '50s 未升级（异常）');
if (got) {
  // 点第一张卡
  await page.evaluate(() => { try { const l = window.__game.scene.getScene('Game').panel?.layout; if (l?.cards?.[0]) return l.cards[0]; } catch {} return null; })
    .then(async c => { if (c) { await page.touchscreen.tap(Math.round(c.cx), Math.round(c.cy)); await page.waitForTimeout(600); } });
}
await shot('m05-after-pick'); await log('pick', '选卡后');
// 前 60s 战斗
while (wall() < 60) {
  const s = await snap();
  if (s.panel) {
    const c = await page.evaluate(() => { try { const l = window.__game.scene.getScene('Game').panel?.layout; return l?.cards?.[0] ?? null; } catch { return null; } });
    if (c) { await page.touchscreen.tap(Math.round(c.cx), Math.round(c.cy)); await page.waitForTimeout(400); }
  }
  await page.touchscreen.tap(cx + (wall() % 2 ? 70 : -70), cy - 40); await page.waitForTimeout(500);
}
await shot('m06-t60'); await log('t60', '前60秒节点');
// 70~150s 走位存活到 Boss 预警
let bossAt = -1, tel = [];
while (wall() < 160) {
  const s = await snap();
  if (s.boss && bossAt < 0) { bossAt = wall(); await shot('m07-boss-entrance'); await log('boss', `Boss 入场 ${bossAt}s ${s.boss.st}/${s.boss.sk}`); }
  if (s.boss && s.boss.st === 'telegraph' && !tel.includes(s.boss.sk)) {
    tel.push(s.boss.sk); await shot(`m08-telegraph-${s.boss.sk}`); await log('boss', `预警 ${s.boss.sk}`);
    await page.waitForTimeout(2200);
  }
  if (s.panel) { const c = await page.evaluate(() => { try { const l = window.__game.scene.getScene('Game').panel?.layout; return l?.cards?.[0] ?? null; } catch { return null; } }); if (c) { await page.touchscreen.tap(Math.round(c.cx), Math.round(c.cy)); await page.waitForTimeout(400); } }
  await page.touchscreen.tap(cx + (wall() % 2 ? 70 : -70), cy - 40); await page.waitForTimeout(350);
}
await shot('m09-boss-fight'); await log('boss-end', `Boss 战 after ${wall()}s`);
await page.waitForTimeout(800);
await shot('m10-final'); await log('final', '收尾');
V.duration = wall(); V.bossAt = bossAt; V.tel = tel; V.videoPath = page.video()?.path() ?? null;
await b.close();
fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ meta: V, errs, tl }, null, 1));
console.log('MOBILE-DONE', JSON.stringify({ source: SOURCE, duration: V.duration, errs: errs.slice(0, 6), video: V.videoPath, bossAt, tel, shots: sh }));
