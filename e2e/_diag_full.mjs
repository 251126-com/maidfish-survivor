// 全量诊断：Boot/Menu/Game 场景状态 + 资源加载进度 + 控制台/网络错误 + 分时截图
// 用法: node e2e/_diag_full.mjs <label> <url> [--click-start]
import { chromium } from 'playwright';
import fs from 'node:fs';

const label = process.argv[2] || 'probe';
const URL = process.argv[3] || 'https://251126-com.github.io/maidfish-survivor/';
const doClick = process.argv.includes('--click-start');
const OUT = `e2e/shots/diag_full/${label}`;
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

const events = { pageerror: [], console: [], reqfail: [], http_bad: [], responses: [] };
page.on('pageerror', e => events.pageerror.push(String(e).slice(0, 500)));
page.on('console', m => { if (['error','warning'].includes(m.type())) events.console.push(`[${m.type()}] ${m.text().slice(0,300)}`); });
page.on('requestfailed', r => events.reqfail.push(`${r.url().slice(0,200)} :: ${r.failure()?.errorText}`));
page.on('response', r => { if (r.status() >= 400) events.http_bad.push(`${r.status()} ${r.url().slice(0,200)}`); });

const t0 = Date.now();
const samples = [];
const snap = (tag) => page.evaluate(() => {
  const w = window;
  const g = w.__game;
  const out = {
    version: w.__VERSION ?? null,
    game: !!g, booted: g?.isBooted ?? null,
    renderer: (() => { try { return g?.renderer?.type === 3 ? 'WebGL' : g?.renderer?.type === 1 ? 'Canvas' : String(g?.renderer?.type); } catch { return '?'; } })(),
    fps: g?.loop?.actualFps ? Math.round(g.loop.actualFps) : null,
    scenes: (() => { try { return g?.scene?.scenes?.map(s => `${s.scene.key}:${s.sys.isActive()?'A':'i'}${s.sys.isSleeping()?'S':''}`).join('|'); } catch { return '?'; } })(),
    current: g?.scene?.getScenes?.(true)?.map(s=>s.scene.key).join(',') ?? null,
    canvas: (() => { const c = document.querySelector('#game canvas'); return c ? `${c.width}x${c.height}` : null; })(),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    readyState: document.readyState,
    preloadProgress: (() => { try { const sc = g?.scene?.getScene('Boot'); return sc?.load?.totalQueued ?? null; } catch { return null; } })(),
    menuCreated: (() => { try { return !!(w.__game?.scene?.getScene('Menu')?.children); } catch { return null; } })(),
    gamePlayer: (() => { try { return !!g?.scene?.getScene('Game')?.player; } catch { return null; } })(),
  };
  return out;
});
const shot = async (tag) => { const f = `${OUT}/${String(samples.length).padStart(2,'0')}_${tag}.png`; await page.screenshot({ path: f, animations: 'allow' }); return f; };

async function sample(tag, extra = {}) {
  const s = await snap(tag);
  const f = await shot(tag);
  samples.push({ t: Date.now() - t0, tag, snap: s, shot: f, ...extra });
  console.log(`[t=${Date.now()-t0}ms] ${tag}: scenes=${s.scenes} renderer=${s.renderer} fps=${s.fps} canvas=${s.canvas} ver=${s.version}`);
}

// 记录资源加载进度
const resLog = async (tag) => page.evaluate(() =>
  performance.getEntriesByType('resource').map(r => ({ n: r.name.split('/').slice(-1)[0], dur: Math.round(r.duration), size: r.transferSize, init: r.initiatorType }))
    .filter(r => /\.(js|png|jpg|jpeg|svg|webp)$/i.test(r.n) || /assets/i.test(r.n))
);

// 第一阶段：load 后连续采样
await page.goto(URL, { waitUntil: 'load', timeout: 120000 }).catch(e => events.pageerror.push('GOTO:' + String(e).slice(0,200)));
await page.waitForTimeout(500); await sample('t500');
await page.waitForTimeout(700); await sample('t1200');
await page.waitForTimeout(800); await sample('t2000');
await page.waitForTimeout(1000); await sample('t3000');
await page.waitForTimeout(2000); await sample('t5000');
await page.waitForTimeout(5000); await sample('t10000');

const resources1 = await resLog('after-load');

// 第二阶段：点击开始（如果要求）
let clickInfo = null;
if (doClick) {
  try {
    await page.mouse.click(640, 216);
    await page.waitForTimeout(800); await sample('game1');
    await page.waitForTimeout(1200); await sample('game2');
    await page.waitForTimeout(2000); await sample('game3');
    clickInfo = { clicked: true };
  } catch (e) { clickInfo = { clicked: false, err: String(e).slice(0,200) }; }
}

const resources2 = await resLog('final');
const result = {
  label, url: URL, startedAt: new Date().toISOString(), doClick,
  navMs: Date.now() - t0,
  samples, clickInfo,
  resources: { afterLoad: resources1, final: resources2 },
  events
};
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(result, null, 2));
console.log('===EVENTS===');
console.log('pageerror:', JSON.stringify(events.pageerror, null, 1));
console.log('console(err/warn):', JSON.stringify(events.console, null, 1));
console.log('reqfail:', JSON.stringify(events.reqfail, null, 1));
console.log('http>=400:', JSON.stringify(events.http_bad, null, 1));
console.log('ressample:', JSON.stringify(resources2.slice(0, 12), null, 1));
await b.close();
console.log('DONE report->', `${OUT}/report.json`);
