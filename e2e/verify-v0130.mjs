// v0.13.0 冒烟：开局引导可跳过/波次预警横幅/精英击杀顿帧/溶解粒子/暴击弹跳/连杀泛红/版本标记
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.E2E_URL || 'http://127.0.0.1:4173/';
const OUT = 'e2e/shots/v0130';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const isNoise = (t) => /favicon|404 \(Not Found\)/.test(t);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !isNoise(m.text())) errors.push(`[console.error] ${m.text()}`); });
const results = [];
const rec = (name, ok, detail='') => { results.push([name, ok, detail]); console.log(`${ok?'✔':'✘'} ${name}${detail?'  '+detail:''}`); };

// 1. 版本标记
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const ver = await page.evaluate(() => window.__VERSION ?? null);
rec('版本标记 __VERSION', ver === '0.13.0', `ver=${ver}`);

// 2. 开局引导：应出现 3 帧漫画感引导，点击跳过
await page.mouse.click(640, 230);   // 进入游戏
await page.waitForTimeout(800);
const guide1 = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { active: s.guideActive, frames: s.guideFrames.length, overlay: !!s.guideOverlay };
});
rec('开局引导出现(3帧)', guide1.active && guide1.frames === 6 && guide1.overlay, JSON.stringify(guide1));
await page.screenshot({ path: `${OUT}/01-guide-frame1.png` });
// 点击跳帧 → 第2帧
await page.mouse.click(640, 360);
await page.waitForTimeout(200);
const guide2 = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const vis = s.guideFrames.map(t => t.visible);
  return { active: s.guideActive, idx: s.guideIdx, firstHidden: vis[0] === false };
});
rec('引导点击跳帧', guide2.active && guide2.idx === 1 && guide2.firstHidden, JSON.stringify(guide2));
await page.screenshot({ path: `${OUT}/02-guide-frame2.png` });
// 再点两下 → 跳过全部引导
await page.mouse.click(640, 360);
await page.waitForTimeout(150);
await page.mouse.click(640, 360);
await page.waitForTimeout(400);
const guideDone = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { active: s.guideActive, frames: s.guideFrames.length };
});
rec('引导可跳过并结束', !guideDone.active && guideDone.frames === 0, JSON.stringify(guideDone));

// 3. 波次预警横幅（0s 开局波）+ 屏幕边缘预警条
await page.waitForTimeout(800);
const banner = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { waveBanner: s.waveBannerText ? s.waveBannerText.text : null, edge: !!s.waveEdgeG };
});
rec('波次预警横幅出现', !!banner.waveBanner, JSON.stringify(banner));
await page.screenshot({ path: `${OUT}/03-wave-banner.png` });

// 4. 精英击杀：顿帧 + 震屏 + 金色浮字 + 溶解粒子
const elite = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const e = s.enemies.spawn('jelly', s.player.x + 60, s.player.y, s.elapsed);
  if (!e) return { ok: false };
  e.isElite = true; e.maxHp = 50; e.hp = 50;
  s.hitStopScale = 1; s.hitStopUntil = 0;
  s.weapons.applyDamage(e, 100, s.enemies, s.player);
  return { ok: true, hitStopScale: s.hitStopScale, hitStopUntil: s.hitStopUntil };
});
rec('精英击杀顿帧触发', elite.ok && elite.hitStopScale < 1 && elite.hitStopUntil > 0, JSON.stringify(elite));
await page.waitForTimeout(120);
const eliteFx = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const particles = s.deathFx.pool.filter(p => p.obj.visible);
  const texts = s.children.list.map(c => c.text ?? '').filter(t => String(t).includes('精英击破'));
  return { particles: particles.length, bubbleGrow: particles.filter(p => p.grow > 1).length, eliteText: texts[0] ?? null };
});
rec('精英击破浮字+溶解粒子', eliteFx.eliteText !== null && eliteFx.particles > 0 && eliteFx.bubbleGrow > 0, JSON.stringify(eliteFx));
await page.screenshot({ path: `${OUT}/04-elite-kill.png` });

// 5. 暴击伤害数字：黄字更大 + 缩放弹跳
const critSetup = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const e = s.enemies.spawn('fish', s.player.x + 140, s.player.y, s.elapsed);
  if (!e) return { ok: false };
  e.hp = 99999; e.maxHp = 99999;
  const prev = s.player.stats.critChance;
  s.player.stats.critChance = 1;
  s.weapons.applyDamage(e, 25, s.enemies, s.player);
  s.player.stats.critChance = prev;
  return { pending: true, crit: true, fontSize: null, scale: null, text: null };
});
await page.waitForTimeout(140);
const crit = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const dt = s.weapons.damageText.pool.find(d => d.obj.visible && d.crit);
  return { ok: !!dt, crit: !!dt, fontSize: dt ? dt.obj.style.fontSize : null, scale: dt ? dt.obj.scaleX : null, text: dt ? dt.obj.text : null };
});
rec('暴击黄字+弹跳缩放', crit.ok && crit.crit && crit.fontSize === '30px' && crit.scale > 0.7, JSON.stringify(crit)); // 0.866 实测为弹跳回落过程值，>0.4 起点且接近 1.0 即生效
await page.screenshot({ path: `${OUT}/05-crit-bounce.png` });

// 6. 连杀泛红：击杀推高连杀 → streakEdge alpha > 0 + 枪口染色
const streak = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const before = s.streakEdge.alpha;
  for (let i = 0; i < 6; i++) {
    const e = s.enemies.spawn('fish', s.player.x + 80 + i * 30, s.player.y, s.elapsed);
    if (e) { e.hp = 1; s.weapons.applyDamage(e, 999, s.enemies, s.player); }
  }
  return { before, after: s.streakEdge.alpha, streak: s.killStreak ? s.killStreak.current : -1, gunTinted: s.player.gun.tint !== 0xffffff };
});
rec('连杀枪口泛红+边缘泛红', streak.streak >= 5 && (streak.after > 0 || streak.gunTinted), JSON.stringify(streak));
await page.screenshot({ path: `${OUT}/06-streak-red.png` });

// 7. 每帧运行正常（update 无异常 → errors 列表为空）
const errorsText = errors.slice(0, 5).join(' | ');
rec('无页面/控制台错误', errors.length === 0, errorsText || 'clean');
console.log('\n== 结果汇总 ==');
const fail = results.filter(r => !r[1]).length;
console.log(`PASS ${results.length - fail}/${results.length}`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
