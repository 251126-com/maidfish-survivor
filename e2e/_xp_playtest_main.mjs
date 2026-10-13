// 真实体验试玩主流程 v3 —— 数据流优先（每~2s采样），佐以关键截图 + 全程视频
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'e2e/shots/experience-review/run3';
fs.mkdirSync(OUT, { recursive: true });
const URL_ONLINE = 'https://251126-com.github.io/maidfish-survivor/';
const URL_LOCAL = 'http://127.0.0.1:8123/';

const V = { label: 'run3', startedAt: new Date().toISOString(), ui: 'desktop 1280x720' };
const tl = [];          // 事件时间轴
const stream = [];      // 周期状态流
const shotMeta = [];
let t0 = 0;
let sh = 0;
const wall = () => +((Date.now() - t0) / 1000).toFixed(1);

// run3: fresh browser
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGE:' + String(e.message || e).slice(0, 250)));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE:' + m.text().slice(0, 250)); });

const snap = () => page.evaluate(() => {
  const w = window; const out = {};
  try {
    out.v = w.__VERSION; out.bg = w.__BG_STATE?.activeName ?? null;
    const g = w.__game, s = g?.scene?.getScene('Game');
    if (!s || !s.player) { out.scene = false; return out; }
    out.scene = true;
    out.renderer = g.renderer?.type === 3 ? 'WebGL' : String(g.renderer?.type ?? '?');
    out.fps = g.loop.actualFps ? Math.round(g.loop.actualFps) : -1;
    out.elapsed = +s.elapsed.toFixed(2);
    out.px = Math.round(s.player.x); out.py = Math.round(s.player.y);
    out.vx = +s.player.vx.toFixed(0); out.vy = +s.player.vy.toFixed(0);
    out.hp = Math.round(s.player.stats.hp); out.maxHp = Math.round(s.player.stats.maxHp);
    out.armor = Math.round(s.player.armor?.armor ?? 0); out.armorMax = Math.round(s.player.armor?.max ?? 0);
    out.level = s.levelSys?.level ?? 0; out.xp = Math.round(s.levelSys?.xp ?? 0);
    out.gold = s.gold; out.kills = s.kills;
    out.enemies = s.enemies?.count ?? 0; out.bullets = s.weapons?.bulletCount ?? 0;
    out.eBullets = s.enemyBullets?.count ?? 0; out.drops = s.drops?.count ?? 0;
    out.paused = !!s.paused; out.panel = !!s.panel?.visible;
    out.hpBuff = Math.round((s.player.stats.maxHp - 100));
    out.boss = s.bossEnemy ? { hp: Math.round(s.bossEnemy.hp), max: Math.round(s.bossEnemy.maxHp), st: s.bossBrain?.state, sk: s.bossBrain?.currentSkill, ph: s.bossBrain?.phase } : null;
    const sp = s.player.sprite;
    out.psy = { sx: Math.round(sp.x), sy: Math.round(sp.y), flipX: sp.flipX, sX: +sp.scaleX.toFixed(2), sY: +sp.scaleY.toFixed(2) };
    return out;
  } catch (e) { out.err = String(e).slice(0, 150); return out; }
});
const log = async (type, note, extra = {}) => {
  let s = null; try { s = await snap(); } catch (e) { s = { err: String(e).slice(0, 120) }; }
  tl.push({ w: wall(), wall: new Date().toISOString().slice(11, 23), type, note, s, ...extra });
  return s;
};
const shot = async (tag) => {
  sh++;
  const f = `${String(sh).padStart(2, '0')}_${tag}.png`;
  try { await page.screenshot({ path: path.join(OUT, f) }); } catch (e) { return { f, err: String(e).slice(0, 100) }; }
  const d = fs.statSync(path.join(OUT, f));
  shotMeta.push({ f, bytes: d.size, w: wall() });
  return { f, bytes: d.size };
};
const move = async (keys, dur) => { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(dur); for (const k of keys) await page.keyboard.up(k); };
const isPanel = () => page.evaluate(() => { try { return !!window.__game.scene.getScene('Game').panel?.visible; } catch { return false; } });
const sampleLoop = (() => { let stop = false; const run = async () => { while (!stop) { try { const s = await snap(); stream.push({ w: wall(), s }); } catch (e) { stream.push({ w: wall(), err: String(e).slice(0,100) }); } await new Promise(r => setTimeout(r, 2000)); } }; run(); return () => { stop = true; }; })();

t0 = Date.now();
const nav0 = Date.now();
try { await page.goto(URL_ONLINE, { waitUntil: 'load', timeout: 40000 }); V.source = 'online'; }
catch (e) { errs.push('NAV-ONLINE:' + String(e).slice(0, 160)); await page.goto(URL_LOCAL, { waitUntil: 'load', timeout: 20000 }); V.source = 'local-dist'; }
V.loadMs = Date.now() - nav0;
await page.waitForTimeout(2000);
let ready = false;
for (let i = 0; i < 16; i++) { const s = await snap(); if (s.scene == null || s.scene === true || s.v) { ready = true; break; } await page.waitForTimeout(500); }
V.menuFrame = await snap();
if (ready) await shot('01-menu');
await log('menu', `加载完成 source=${V.source} loadMs=${V.loadMs}`, { shot: shotMeta.at(-1) || null });
console.log('MENU', JSON.stringify({ source: V.source, loadMs: V.loadMs, ready, menuFrame: V.menuFrame }));

// 开始
const c0 = Date.now();
await page.mouse.click(640, 216);
await page.waitForTimeout(1600);
await shot('02-game-start'); await log('game-start', '点击开始后的开局画面', { clickMs: Date.now() - c0 });
console.log('START', JSON.stringify((await log('tmp', '', {})).s));

// 输入延迟：D 键 → vx>100 的轮询耗时
let latMs = -1;
await page.keyboard.down('d');
for (let i = 0; i < 150; i++) {
  const s = await snap();
  if (s.vx > 100) { latMs = Math.round((Date.now() - c0) * 10) / 10 + 1.6; break; }
  await new Promise(r => setTimeout(r, 16));
}
await page.keyboard.up('d');
V.inputLatencyMs = latMs;
await log('input', `D键→移动生效延迟=${latMs}ms(轮询16ms粒度过采样)`);

// 移动：记录位移
const p0 = await snap();
await move(['d'], 1400); const p1 = await snap();
await move(['s'], 1400); await shot('03-move-down');
const p2 = await snap();
await move(['a'], 1400); await move(['w'], 1400);
await shot('04-move-circle'); const p3 = await snap();
V.movePx = { d: Math.round(Math.hypot(p1.px - p0.px, p1.py - p0.py)), s: Math.round(Math.hypot(p2.px - p1.px, p2.py - p1.py)) };
await log('move', `位移 d=${V.movePx.d}px s=${V.movePx.s}px (各~1.4s)`, { p0, p3 });
console.log('MOVE', JSON.stringify({ inputLatencyMs: latMs, movePx: V.movePx, p3 }));

// 战斗 24s 采样
await page.waitForTimeout(24000);
await shot('05-fight-mid'); await log('fight', '开局战斗24s后：自动开火/击杀/掉落');
console.log('FIGHT-A', JSON.stringify((await log('tmp','',{})).s));

// 升级面板（最多等 45s）
let got = false;
for (let i = 0; i < 90; i++) { if (await isPanel()) { got = true; break; } await page.waitForTimeout(500); }
await shot(got ? '06-levelup' : '06-levelup-timeout'); await log('levelup', got ? '升级面板出现' : '45s内未出现升级面板');
console.log('LV', JSON.stringify((await log('tmp','',{})).s));
const cards = await page.evaluate(() => { try { const l = window.__game.scene.getScene('Game').panel?.layout; return l ? { cx: l.cards.map(c => Math.round(c.cx)), cy: Math.round(l.cards[0].cy), names: l.cards.map(c => c.name), kinds: l.cards.map(c => c.kind) } : null; } catch { return null; } });
console.log('CARDS', JSON.stringify(cards));
if (cards) {
  await page.waitForTimeout(1200);
  await page.mouse.click(cards.cx[1] ?? cards.cx[0], cards.cy);
  await page.waitForTimeout(700);
  await shot('07-after-pick'); await log('pick', `选中卡: ${(cards.names || [])[1] ?? '第2张'} (${(cards.kinds || [])[1] ?? ''})`);
}

// 掉落/护甲（调试钩子标注）
await page.evaluate(() => { window.__DROP_RNG = () => 0.001; });
for (let i = 0; i < 12; i++) { await move(i % 2 ? ['w'] : ['d'], 500); const s = await snap(); if (s.armor > 0 || s.drops > 2) break; }
await page.evaluate(() => { delete window.__DROP_RNG; });
await shot('08-loot-scan'); await log('loot', '稀有掉落/护甲(调试钩子__DROP_RNG=0.001)', { debug: true });
await page.waitForTimeout(2000); await shot('09-loot-pickup'); await log('loot', '拾取后状态');
console.log('LOOT', JSON.stringify((await log('tmp','',{})).s));

// 挨打/护甲吸收
await move(['w'], 1500); await move(['d'], 2000); await page.waitForTimeout(1000);
await shot('10-hit'); await log('hit', '冲进敌群受击反馈');
console.log('HIT', JSON.stringify((await log('tmp','',{})).s));

// 中期高压
for (let i = 0; i < 4; i++) { await move(['a'], 500); await move(['d'], 500); }
await page.waitForTimeout(5000);
await shot('11-mid'); await log('fight', '中期敌群密度');
console.log('MID', JSON.stringify((await log('tmp','',{})).s));

// Boss（调试路径 elapsed=599 → 真实 spawner 触发）
await page.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.elapsed = 599; s.spawnTimer = 0.1; });
await page.waitForTimeout(1500);
await shot('12-boss-approach'); await log('boss', '时间推进599s(调试)等Boss登场', { debug: true });
let seen = false;
for (let i = 0; i < 40; i++) { const s = await snap(); if (s.boss) { seen = true; break; } await page.waitForTimeout(500); }
const sB = await snap();
await shot(seen ? '13-boss-entrance' : '13-boss-miss'); await log('boss', seen ? `Boss登场 ${sB.boss.hp}/${sB.boss.max}` : '未登场', { debug: true });
console.log('BOSS-ENT', JSON.stringify(sB));

// 预警轮询
let tele = null;
for (let i = 0; i < 80; i++) {
  const st = await page.evaluate(() => { try { const br = window.__game.scene.getScene('Game').bossBrain; return br ? { st: br.state, sk: br.currentSkill, ph: br.phase } : null; } catch { return null; } });
  if (st && st.st === 'telegraph') { tele = st; break; }
  await move(i % 8 < 4 ? ['w'] : ['s'], 260);
}
await shot(tele ? '14-boss-telegraph' : '14-boss-telegraph-miss');
await log('boss', tele ? `预警 telegraph: ${tele.sk} phase=${tele.ph}` : '未捕获telegraph', { tele, debug: true });

// Boss 战走位
await move(['a'], 1200); await move(['s'], 1200); await move(['d'], 1200); await move(['w'], 1200);
await page.waitForTimeout(3000);
await shot('15-boss-fight'); await log('boss', 'Boss战走位中');
console.log('BOSS-F', JSON.stringify((await log('tmp','',{})).s));

// 收尾
for (let i = 0; i < 8; i++) { await move(i % 2 ? ['a', 'w'] : ['d', 's'], 700); }
await shot('16-final'); await log('final', '收尾');
V.videoPath = page.video()?.path() ?? null;
V.duration = wall();
sampleLoop();
await b.close();
fs.writeFileSync(path.join(OUT, 'timeline_main.json'), JSON.stringify({ meta: V, errs, tl, stream, shotMeta }, null, 2));
console.log('DONE', JSON.stringify({ source: V.source, duration: V.duration, errs, video: V.videoPath }));
