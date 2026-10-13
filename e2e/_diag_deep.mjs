// 深度探针：场景内部状态 + loader + 网络事件级监听
const label = process.argv[2] || 'deep';
const URL = process.argv[3] || 'https://251126-com.github.io/maidfish-survivor/';
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = `e2e/shots/diag_full/${label}`;
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const ev = { pageerror: [], console: [], req: [], res: [] };
page.on('pageerror', e => ev.pageerror.push(String(e).slice(0,300)));
page.on('console', m => { if(['error','warning','log'].includes(m.type()) && /Phaser|loader|LOAD|scene|error|Error|warn|bg_|player_|index-/.test(m.text())) ev.console.push(`[${m.type()}] ${m.text().slice(0,220)}`); });
page.on('request', r => { if(/\.(png|jpg|js)$/.test(r.url()) || /assets/.test(r.url())) ev.req.push(`REQ ${r.method()} ${r.url().slice(-60)}`); });
page.on('response', r => { if(/\.(png|jpg|js)$/.test(r.url()) || /assets/.test(r.url())) ev.res.push(`RES ${r.status()} ${r.url().slice(-60)}`); });
await page.goto(URL, { waitUntil: 'load', timeout: 120000 }).catch(e=>ev.pageerror.push('GOTO:'+String(e)));
await page.waitForTimeout(500);
const deep = await page.evaluate(() => {
  const g = window.__game; if (!g) return { noGame: true };
  const out = { booted: g.isBooted, rendererType: g.renderer?.type, textureReady: !!g.textures?.getTextureKeys?.()?.length };
  out.textures = g.textures?.getTextureKeys?.()?.slice(0,25) ?? null;
  out.scenes = g.scene?.scenes?.map(s => {
    const sys = s.sys || {}; const settings = sys.settings || {};
    return { key: s.scene?.key ?? settings.key, status: settings.status, isBooted: sys.isBooted?.(), active: sys.isActive?.(), sleeping: sys.isSleeping?.(), visible: sys.isVisible?.() };
  });
  out.events = (g.events?.eventNames?.() ?? []).map(n => String(n)).slice(0, 40);
  return out;
});
// 直接操纵查看 Phaser loader
const loaderInfo = await page.evaluate(() => {
  try {
    const boot = window.__game?.scene?.getScene('Boot');
    const l = boot?.load;
    return { hasBoot: !!boot, queueTotal: l?.queue.size ?? l?.totalQueued, isLoading: l?.isLoading, files: l?.queue ? Array.from(l.queue.keys()).map(k=>String(k)).slice(0,20) : null };
  } catch(e){ return { err: String(e) }; }
});
await page.waitForTimeout(3000);
const deep2 = await page.evaluate(() => {
  const g = window.__game; const out = {};
  out.scenes2 = g.scene?.scenes?.map(s => ({ key: s.scene.key, status: s.sys.settings.status, active: s.sys.isActive() }));
  out.textures2 = g.textures?.getTextureKeys?.()?.slice(0,25) ?? null;
  out.loop = { running: g.loop?.running, fps: g.loop?.actualFps };
  return out;
});
await page.screenshot({ path: `${OUT}/deep.png`, animations: 'allow' });
const res = { label, url: URL, deep, loaderInfo, deep2, ev };
fs.writeFileSync(`${OUT}/deep.json`, JSON.stringify(res, null, 2));
console.log('DEEP', JSON.stringify(deep, null, 1));
console.log('LOADERINFO', JSON.stringify(loaderInfo, null, 1));
console.log('DEEP2', JSON.stringify(deep2, null, 1));
console.log('EVENTS', JSON.stringify(ev, null, 1).slice(0, 2500));
await b.close();
