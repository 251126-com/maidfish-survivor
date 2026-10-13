// v0.10.0 真实体验验收（本地构建 dist）：
// 真实时间推进（不注入 elapsed）：0-60s 开局战斗 + 真实等到 150s Boss 登场与三技能预警。
// 输出：视频 webm + 关键截图 + timeline.json → e2e/shots/experience-review/final/
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'e2e/shots/experience-review/final/desktop';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const URL = 'http://127.0.0.1:4173/';
const V = { label: 'final-desktop', startedAt: new Date().toISOString(), ui: 'desktop 1280x720', source: 'local-dist-0.10.0' };
const tl = [], stream = [], shotMeta = [], errs = [];
let t0 = 0, sh = 0, panelPicks = 0;
const wall = () => +((Date.now() - t0) / 1000).toFixed(1);

const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
page.on('pageerror', e => errs.push('PAGE:' + String(e.message || e).slice(0, 250)));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE:' + m.text().slice(0, 250)); });
page.on('requestfailed', r => errs.push('REQFAIL:' + r.url().slice(-80) + ' :: ' + (r.failure()?.errorText || '')));

const snap = () => page.evaluate(() => {
  const out = {};
  try {
    out.v = window.__VERSION; out.bg = window.__BG_STATE?.activeName ?? null;
    const g = window.__game, s = g?.scene?.getScene('Game');
    if (!s || !s.player) { out.scene = false; return out; }
    out.scene = true; out.fps = Math.round(g.loop.actualFps || 0);
    out.elapsed = +s.elapsed.toFixed(1); out.px = Math.round(s.player.x); out.py = Math.round(s.player.y);
    out.hp = Math.round(s.player.stats.hp); out.maxHp = Math.round(s.player.stats.maxHp);
    out.armor = Math.round(s.player.armorValue ?? 0); out.level = s.levelSys?.level ?? 0;
    out.xp = Math.round(s.levelSys?.xp ?? 0); out.gold = s.gold; out.kills = s.kills;
    out.enemies = s.enemies?.count ?? 0; out.bullets = s.weapons?.bulletCount ?? 0;
    out.drops = s.drops?.count ?? 0; out.deathFx = s.deathFx?.visibleCount ?? 0;
    out.streak = s.streak?.current ?? 0; out.panel = !!s.panel?.visible;
    out.waveBanner = !!s.waveBannerText; out.bossBanner = !!s.bossBannerText;
    out.boss = s.bossEnemy ? { hp: Math.round(s.bossEnemy.hp), max: Math.round(s.bossEnemy.maxHp), st: s.bossBrain?.state, sk: s.bossBrain?.currentSkill, ph: s.bossBrain?.phase } : null;
    return out;
  } catch (e) { out.err = String(e).slice(0, 150); return out; }
});
const shot = async (tag) => {
  sh++;
  const f = `${String(sh).padStart(2, '0')}_${tag}.png`;
  try { await page.screenshot({ path: path.join(OUT, f) }); } catch (e) { return { f, err: String(e).slice(0,100) }; }
  const meta = { f, bytes: fs.statSync(path.join(OUT, f)).size, w: wall() };
  shotMeta.push(meta); return meta;
};
const log = async (type, note, extra = {}) => {
  let s = null; try { s = await snap(); } catch (e) { s = { err: String(e).slice(0,120) }; }
  tl.push({ w: wall(), wall: new Date().toISOString().slice(11,23), type, note, s, ...extra });
  return s;
};
const moveKeys = async (keys, dur) => {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(dur);
  for (const k of keys) await page.keyboard.up(k);
};
const isPanel = () => page.evaluate(() => { try { return !!window.__game.scene.getScene('Game').panel?.visible; } catch { return false; } });

// 采样流（每 1s，低开销）
const sampleLoop = (() => {
  let stop = false;
  const run = async () => { while (!stop) { try { stream.push({ w: wall(), s: await snap() }); } catch { /* skip */ } await new Promise(r => setTimeout(r, 1000)); } };
  run();
  return () => { stop = true; };
})();

t0 = Date.now();
const nav0 = Date.now();
try { await page.goto(URL, { waitUntil: 'load', timeout: 40000 }); } catch (e) { errs.push('NAV:' + String(e).slice(0,160)); }
V.loadMs = Date.now() - nav0;
await page.waitForTimeout(2500);
await shot('01-menu'); await log('menu', `本地构建加载 source=${V.source} loadMs=${V.loadMs}`);
console.log('MENU', JSON.stringify(await log('m','')));

// 开始游戏
await page.mouse.click(640, 216);
await page.waitForTimeout(1800);
await shot('02-game-start'); await log('game-start', '开局画面（应有鱼群来袭横幅）');
const s0 = await log('t0', '');

// 移动 + 战斗（真实时间）
await moveKeys(['d'], 1500); await moveKeys(['s'], 1500);
await shot('03-move-fight'); await log('move', 'WASD 移动 + 自动开火');
const sA = await snap();

// 等待首次升级面板（最多 60s）
let lvTime = -1, got = false;
const lvStart = Date.now();
for (let i = 0; i < 120; i++) {
  if (await isPanel()) { got = true; lvTime = wall(); break; }
  if (i % 10 === 0) await moveKeys(i % 2 ? ['a','w'] : ['d','s'], 400);
  await page.waitForTimeout(500);
}
await shot(got ? '04-first-levelup' : '04-levelup-timeout');
await log('levelup', got ? `首次升级面板在 ${lvTime}s 出现` : '60s 内未升级（异常）');
if (got) {
  await page.waitForTimeout(900);
  const cards = await page.evaluate(() => { try { const l = window.__game.scene.getScene('Game').panel?.layout; return l ? { cx: l.cards.map(c => Math.round(c.cx)), cy: Math.round(l.cards[0].cy) } : null; } catch { return null; } });
  if (cards) { await page.mouse.click(cards.cx[1] ?? cards.cx[0], cards.cy); panelPicks++; }
  await page.waitForTimeout(700);
  await shot('05-after-pick'); await log('pick', '升级面板已选卡，继续战斗');
}
console.log('LEVELUP', JSON.stringify({ got, lvTime, sA }));

// 继续战斗到 60s：击杀爆散/掉落/连杀反馈
let waveSnap = null;
while (wall() < 42) {
  await moveKeys(wall() % 2 ? ['d','s'] : ['a','w'], 600);
  waveSnap = await snap();
  const s = waveSnap;
  if (s.panel) {
    const cards = await page.evaluate(() => { try { const l = window.__game.scene.getScene('Game').panel?.layout; return l ? { cx: l.cards.map(c => Math.round(c.cx)), cy: Math.round(l.cards[0].cy) } : null; } catch { return null; } });
    if (cards) { await page.mouse.click(cards.cx[0], cards.cy); panelPicks++; await page.waitForTimeout(500); }
  }
  await page.waitForTimeout(400);
}
await shot('06-wave3-fight'); await log('wave', `42s 波次/前60s 战斗 kills=${waveSnap.kills} level=${waveSnap.level} enemies=${waveSnap.enemies}`);
// 60s 采样点
while (wall() < 60) { await moveKeys(['d'], 400); await moveKeys(['w'], 400); }
await shot('07-t60'); await log('t60', '前60秒体验节点');
console.log('T60', JSON.stringify((await log('','')).s));

// 60~145s：持续走位存活（每 10s 截图一张，观察敌群/Boss预警倒计时）
for (let target = 70; target <= 140; target += 10) {
  while (wall() < target) { await moveKeys(target % 20 < 10 ? ['a','s'] : ['d','w'], 600); const s = await snap(); if (s.panel) { const cards = await page.evaluate(() => { try { const l = window.__game.scene.getScene('Game').panel?.layout; return l ? { cx: l.cards.map(c => Math.round(c.cx)), cy: Math.round(l.cards[0].cy) } : null; } catch { return null; } }); if (cards) { await page.mouse.click(cards.cx[2] ?? cards.cx[0], cards.cy); panelPicks++; await page.waitForTimeout(400); } } await page.waitForTimeout(300); }
  await shot(`08_t${target}`); await log('mid', `${target}s 走位存活（真实时间推进到 Boss）`);
}

// Boss 145~180s：入场横幅 + 三技能预警
let bossSeenAt = -1;
while (wall() < 175) {
  const s = await snap();
  if (s.boss && bossSeenAt < 0) {
    bossSeenAt = wall();
    await shot('09-boss-entrance'); await log('boss', `Boss ${s.boss.hp}/${s.boss.max} 于 ${bossSeenAt}s 入场（真实时间）`);
    console.log('BOSS-ENT', JSON.stringify(s));
  }
  if (s.boss && s.boss.st === 'telegraph') {
    await shot(`10-telegraph-${s.boss.sk || '?'}`); await log('boss', `预警 telegraph: ${s.boss.sk} phase=${s.boss.ph}`);
    await page.waitForTimeout(2600);  // 完整看一次预警+出招
  }
  await moveKeys(wall() % 2 ? ['d','s'] : ['a','w'], 500);
  await page.waitForTimeout(350);
}
await shot('11-boss-fight'); await log('boss', 'Boss 战走位后（真实）');
const sB = await log('boss-end', '');
console.log('BOSS-F', JSON.stringify(sB));

// 收尾
await page.waitForTimeout(1000);
await shot('12-final'); await log('final', '收尾');
V.duration = wall(); V.panelPicks = panelPicks;
V.videoPath = page.video()?.path() ?? null;
sampleLoop();
await b.close();
fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ meta: V, errs, tl, stream, shotMeta }, null, 1));
console.log('DONE', JSON.stringify({ duration: V.duration, errs: errs.slice(0,8), video: V.videoPath, shots: shotMeta.length, bossSeenAt }));
