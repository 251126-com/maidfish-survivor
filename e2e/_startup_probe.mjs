// 启动耗时探针：记录 goto/资源/Boot预载/Menu激活 各阶段耗时
import { chromium } from 'playwright';
const URL = process.env.E2E_URL || 'http://127.0.0.1:4173/';
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const t0 = Date.now();
const marks = {};
const log = (k) => { marks[k] = Date.now() - t0; console.log(`[t+${marks[k]}ms] ${k}`); };
page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0,300)));
page.on('console', m => { if (['error','warning'].includes(m.type())) console.log(`[${m.type()}]`, m.text().slice(0,200)); });
// Phaser 生命周期打点（在页面内注入 hook 需要先 load）
await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
log('page_load');
// 轮询: Boot preload 完成 = Menu 场景存在 children / __game 就绪
let menuT = null, bootT = null, bootPre = null;
for (let i = 0; i < 600; i++) {
  const st = await page.evaluate(() => {
    const g = window.__game;
    if (!g) return null;
    const scenes = g.scene.scenes.map(s => s.scene.key + ':' + (s.sys.isActive() ? 'A' : 'i') + (s.sys.isSleeping() ? 'S' : ''));
    const boot = g.scene.getScene('Boot');
    const menu = g.scene.getScene('Menu');
    const bootPreloadDone = !!(boot && boot.load && boot.load.totalQueued === 0 && boot.load.isLoading === false);
    const menuCreated = !!(menu && menu.children);
    const renderer = g.renderer && g.renderer.type === 3 ? 'WebGL' : g.renderer ? 'Other' : '?';
    return { scenes: scenes.join('|'), bootPreloadDone, menuCreated, renderer, loopRunning: g.loop && g.loop.running };
  });
  if (st && st.bootPreloadDone && bootT === null) { bootT = Date.now() - t0; log(`boot_preload_done (renderer=${st.renderer})`); }
  if (st && st.menuCreated && menuT === null) { menuT = Date.now() - t0; log('menu_created'); }
  if (st && st.menuCreated) { log(`scenes=${st.scenes} loop=${st.loopRunning}`); break; }
  await page.waitForTimeout(100);
}
const res = await page.evaluate(() => performance.getEntriesByType('resource')
  .filter(r => /\.(js|png|jpg|jpeg|svg|webp)$/i.test(r.name))
  .map(r => ({ n: r.name.split('/').slice(-1)[0], dur: Math.round(r.duration), size: r.transferSize, init: r.initiatorType })));
console.log('RESOURCES:'); for (const r of res) console.log('  ', JSON.stringify(r));
await page.screenshot({ path: 'e2e/shots/startup_menu.png', animations: 'allow' });
await b.close();
