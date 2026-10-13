import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'e2e/shots/experience-review';
const URL = 'https://251126-com.github.io/maidfish-survivor/';
fs.mkdirSync(path.join(OUT, 'online'), { recursive: true });

const V = { startedAt: new Date().toISOString(), url: URL, label: 'online' };
const timeline = [];
let shotIdx = 0;
let t0 = 0;

const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGE:' + e.message.slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE:' + m.text().slice(0, 300)); });

const shot = async (tag) => { shotIdx++; const f = `online/${String(shotIdx).padStart(2,'0')}_${tag}.png`; await page.screenshot({ path: path.join(OUT, f) }); return f; };
const snap = () => page.evaluate(() => {
  const w = window; const out = { v: w.__VERSION, bg: w.__BG_STATE?.activeName ?? null, renderer: (()=>{try{return w.__game?.renderer?.type===3?'WebGL':'Canvas';}catch{return '?'}})() };
  try {
    const g = w.__game, s = g?.scene?.getScene('Game');
    if (!s || !s.player) return out;
    out.elapsed = +s.elapsed.toFixed(1); out.fps = Math.round(g.loop.actualFps ?? 0);
    out.px = Math.round(s.player.x); out.py = Math.round(s.player.y);
    out.hp = Math.round(s.player.stats.hp); out.maxHp = Math.round(s.player.stats.maxHp);
    out.armor = s.player.armor?.armor ?? 0; out.armorMax = s.player.armor?.max ?? 0;
    out.level = s.levelSys?.level ?? 0; out.xp = Math.round(s.levelSys?.xp ?? 0);
    out.gold = s.gold; out.kills = s.kills; out.enemies = s.enemies?.count ?? 0;
    out.bullets = s.weapons?.bulletCount ?? 0; out.friendBullets = s.enemyBullets?.count ?? 0;
    out.drops = s.drops?.count ?? 0; out.paused = !!s.paused; out.panel = !!s.panel?.visible;
    out.boss = s.bossEnemy ? { hp: Math.round(s.bossEnemy.hp), hpFrac: +(s.bossEnemy.hp/s.bossEnemy.maxHp).toFixed(3), state: s.bossBrain?.state, skill: s.bossBrain?.skill, phase: s.bossBrain?.phase } : null;
    out.psy = { x: Math.round(s.player.sprite.x), y: Math.round(s.player.sprite.y), flipX: s.player.sprite.flipX,
      sX: +s.player.sprite.scaleX.toFixed(3), sY: +s.player.sprite.scaleY.toFixed(3),
      bob: +(s.player.sprite.y - s.player.y).toFixed(1), recoil: +s.player.recoilX.toFixed(2), face: s.player.fxState ?? null };
    return out;
  } catch (e) { out.err = String(e).slice(0, 200); return out; }
});
const log = async (type, note, extra = {}) => { const s = await snap(); const entry = { t: Date.now()-t0, wall: new Date().toISOString().slice(11,23), type, note, snap: s, ...extra }; timeline.push(entry); return s; };

const move = async (keys, dur) => { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(dur); for (const k of keys) await page.keyboard.up(k); };
const isPanel = () => page.evaluate(() => { try { return !!window.__game.scene.getScene('Game').panel?.visible; } catch { return false; } });
const bossState = () => page.evaluate(() => { try { const br = window.__game.scene.getScene('Game').bossBrain; return br ? { st: br.state, sk: br.skill, ph: br.phase } : null; } catch { return null; } });

t0 = Date.now();
const navT = Date.now();
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
V.loadMs = Date.now() - navT;
await page.waitForTimeout(2000);
V.first = await snap();
V.videoPath = page.video()?.path() ?? null;
await shot('01-menu'); await log('menu', '菜单加载完成');
console.log('LOAD', V.loadMs, JSON.stringify(V.first));

// 开始
await page.mouse.click(640, 216);
await page.waitForTimeout(1500);
await shot('02-game-start'); await log('game-start', '点击开始游戏进入对局');
console.log('GAME START');

// 移动+自动开火
await move(['d'], 1500); await shot('03-move-right'); await log('move', 'D 键向右 1.5s');
await move(['s'], 1200); await shot('04-move-down'); await log('move', 'S 键向下 1.2s');
await move(['a'], 1300); await move(['w'], 1300); await shot('05-move-circle'); await log('move', 'A/W 画圈走位');

// 真实等首杀/刷怪
await page.waitForTimeout(8000);
await shot('06-first-fight'); await log('fight', '首杀/刷怪/掉落观察');
console.log('EARLY', JSON.stringify((await log('tmp',',',{}))));

// 等升级面板
let got = false;
for (let i=0;i<60;i++){ if (await isPanel()) { got=true; break; } await page.waitForTimeout(500); }
await shot('07-levelup-panel'); await log('levelup', got?'升级面板弹出':'升级面板未在30s内出现');
const cardC = await page.evaluate(() => { try { const l = window.__game.scene.getScene('Game').panel?.layout; return l ? { cx: l.cards.map(c=>Math.round(c.cx)), cy: Math.round(l.cards[0].cy) } : null; } catch { return null; } });
console.log('CARDS', JSON.stringify(cardC));
const cy = cardC?.cy ?? 360;
if (cardC) { await page.mouse.click(cardC.cx[1], cy); await page.waitForTimeout(800); }
await shot('08-after-pick'); await log('pick', '选中第二张升级卡');

// 稀有掉落覆盖：注入 __DROP_RNG 强制下一只怪掉大白饭，再强制掉饭盆（游戏自带调试钩子）
await page.evaluate(() => { window.__DROP_RNG = () => 0.001; });           // 命中 饭盆(0.0035)？0.001<0.0035 → bowl
await move(['d'], 800);
await page.evaluate(() => { delete window.__DROP_RNG; });
await page.waitForTimeout(1500);
await shot('09-bowl-drop'); await log('loot', '注入钩子强制稀有掉落观察(标记为调试路径)');
// 拾取
await page.waitForTimeout(2500);
await shot('10-bowl-pickup'); await log('loot', '饭盆拾取：护甲+30 表现');
console.log('LOOT', JSON.stringify((await log('tmp',',',{}))));

// 真实挨打看护甲破裂：向敌人群走
await move(['w'], 1500);
await move(['d'], 2000);
await page.waitForTimeout(1200);
await shot('11-armor-hit'); await log('hit', '真实接触敌人，观察护甲吸收/护甲破裂反馈');

// 升级再来一次看武器增强表现
await page.waitForTimeout(500);
if (await isPanel()) { await page.mouse.click(640, cy); await page.waitForTimeout(700); }
await shot('12-again-pick'); await log('pick', '再次选择升级卡');

// 中期 12s
await move(['s'], 2000); await page.waitForTimeout(6000);
await shot('13-fight-mid'); await log('fight', '中期移动走位+自动开火');
console.log('MID', JSON.stringify((await log('tmp',',',{}))));

// Boss 覆盖：时间推进到 599s，由真实刷怪逻辑触发
await page.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.elapsed = 599; s.spawnTimer = 0.1; });
await page.waitForTimeout(1200);
await shot('14-boss-approach'); await log('boss', '时间推进至599s(内部)，Boss由真实逻辑触发(标记为调试路径)');
let seen = false;
for (let i=0;i<30;i++){ if (await page.evaluate(() => { try { return !!window.__game.scene.getScene('Game').bossEnemy; } catch { return false; } })) { seen=true; break; } await page.waitForTimeout(500); }
await shot('15-boss-entrance'); await log('boss', seen?'Boss登场：横幅/血条/震动':'Boss未登场');
console.log('BOSS-ENT', JSON.stringify((await log('tmp',',',{}))));

// 轮询到 telegraph 时截图预警
let tele = null;
for (let i=0;i<50;i++){ const st = await bossState(); if (st && st.st==='telegraph') { tele = st; break; }
  if (i%4===0) await page.keyboard.down(i%8<4?'w':'s'); else await page.keyboard.up(i%8<4?'w':'s'); await page.waitForTimeout(240); }
for (const k of ['w','s']) await page.keyboard.up(k);
await shot('16-boss-telegraph'); await log('boss', tele?`Boss预警: ${tele.sk} phase=${tele.ph}`:'预警轮询未命中', { tele });

// 真实走位躲 8s
await move(['a'], 1000); await move(['d'], 1000); await move(['w'], 1000); await move(['s'], 1000);
await page.waitForTimeout(2000);
await shot('17-boss-fight'); const sBf = await log('boss', 'Boss战走位中：friendBullets=敌方弹幕数');
console.log('BOSS-FIGHT', JSON.stringify(sBf));

// Boss 战尾声：统计累计击杀/等级
await move(['a','w'], 2500);
await page.waitForTimeout(2000);
await shot('18-final'); await log('final', '收尾采样');
console.log('FINAL', JSON.stringify((await log('tmp',',',{}))));

await b.close();
fs.writeFileSync(path.join(OUT, 'timeline_online.json'), JSON.stringify({ meta: V, errs, timeline }, null, 2));
console.log('DONE online errs=', JSON.stringify(errs));
console.log('VIDEO=', V.videoPath);
