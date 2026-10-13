// 手机横屏体验试玩 —— 只读
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'e2e/shots/experience-review/run2';
const URL = 'https://251126-com.github.io/maidfish-survivor/';
fs.mkdirSync(OUT, { recursive: true });
const V = { label: 'mobile-landscape', startedAt: new Date().toISOString(), ui: 'phone-landscape 844x390' };
const timeline = [];
let t0 = Date.now();

const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, recordVideo: { dir: OUT, size: { width: 844, height: 390 } } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGE:' + String(e.message||e).slice(0,200)));
page.on('console', m => { if (m.type()==='error') errs.push('CONSOLE:'+m.text().slice(0,200)); });

const shot = async (tag, sfx='') => { const f = `m_${tag}.png`; await page.screenshot({ path: path.join(OUT, f) }); return f; };
const snap = () => page.evaluate(() => {
  const w = window; const out = {};
  try { const g = w.__game, s = g?.scene?.getScene('Game'); out.v = w.__VERSION; out.bg = w.__BG_STATE?.activeName ?? null;
    if (!s || !s.player) { out.scene = false; return out; }
    out.elapsed = +s.elapsed.toFixed(1); out.fps = g.loop.actualFps ? Math.round(g.loop.actualFps) : -1;
    out.px = Math.round(s.player.x); out.py = Math.round(s.player.y);
    out.hp = Math.round(s.player.stats.hp); out.enemies = s.enemies?.count ?? 0;
    out.orient = w.innerWidth >= w.innerHeight ? 'landscape' : 'portrait';
  } catch(e){ out.err = String(e).slice(0,150); } return out;
});

await page.goto(URL, { waitUntil: 'load', timeout: 45000 });
V.loadMs = Date.now() - t0;
await page.waitForTimeout(2500);
await shot('m01-menu');
V.menu = await snap();
// 触屏点击开始（菜单按钮位置按比例换算 844/1280, 390/720）
await page.touchscreen.tap(Math.round(844*0.5), Math.round(390*0.30));
await page.waitForTimeout(1800);
await shot('m02-game-start');
V.start = await snap();
// 摇杆拖动 2s（画圈）+ 等待
const cx = Math.round(844*0.18), cy = Math.round(390*0.8);
await page.touchscreen.tap(cx, cy);
await page.waitForTimeout(600);
// 拖拽
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx+90, cy-40, { steps: 12 }); await page.waitForTimeout(400);
await page.mouse.move(cx-90, cy+40, { steps: 12 }); await page.waitForTimeout(400);
await page.mouse.move(cx, cy, { steps: 8 });
await page.mouse.up();
await shot('m03-joystick'); V.moved = await snap();
await page.waitForTimeout(6000);
await shot('m04-fight'); V.fight = await snap();
await page.waitForTimeout(8000);
await shot('m05-levelup-or-mid'); V.late = await snap();
V.videoPath = page.video()?.path() ?? null;
await b.close();
fs.writeFileSync(path.join(OUT, 'timeline_mobile.json'), JSON.stringify({ meta: V, errs, timeline }, null, 2));
console.log('MOBILE DONE', JSON.stringify({ source: 'online', loadMs: V.loadMs, menu: V.menu, start: V.start, moved: V.moved, fight: V.fight, late: V.late, errs }));
console.log('VIDEO=', V.videoPath);
