// v0.16.0 冒烟：动态大厅（概念图背景 + 活鲸鱼容器层 + 金鱼巡游 + 玻璃高光）/
// 皮肤切换(饭盆头完整立绘对齐) / 战斗内外皮肤一致 / 进入战斗不崩 / 无页面错误
// 截图存 e2e/shots/v0160（已 gitignore）
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.E2E_URL || 'http://127.0.0.1:4173/';
const OUT = 'e2e/shots/v0160';
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
const KEY = 'maidfish-survivor-save-v1';

// headless 失焦修正（仅测试环境，不改产品代码）：保证 650ms 产品阈值按游戏内时间触发
async function ensureLoopInFocus() {
  await page.evaluate(() => {
    const loop = window.__game?.loop;
    if (loop && loop.inFocus === false) loop.inFocus = true;
  });
}

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1600);
await ensureLoopInFocus();

// 1. 版本标记
const ver = await page.evaluate(() => window.__VERSION ?? null);
rec('版本标记 __VERSION=0.16.0', ver === '0.16.0', `ver=${ver}`);

// 2. 动态大厅构成：概念图背景 / 活鲸鱼容器层 / 表情 / 金鱼 / 玻璃高光
const lobby = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Menu');
  const kids = s.children.list;
  return {
    bg: kids.some(o => o.texture && o.texture.key === 'lobby_bg'),
    whaleC: !!s.whaleC && s.whaleC.type === 'Container',
    whaleBodyTex: s.whaleC ? s.whaleC.list[0]?.texture?.key : null,
    whaleFxTex: s.whaleFx ? s.whaleFx.texture.key : null,
    zzz: s.zzz ? s.zzz.length : 0,
    fish: s.fish ? s.fish.length : 0,
    fishTex: s.fish && s.fish[0] ? s.fish[0].img.texture.key : null,
    streaks: s.streaks ? s.streaks.length : 0,
    streakTex: s.streaks && s.streaks[0] ? s.streaks[0].texture.key : null
  };
});
rec('概念图背景 + 活鲸鱼容器层(女仆装底图) + 表情 + 3Zzz + 4金鱼 + 3玻璃高光',
  lobby.bg && lobby.whaleC && lobby.whaleBodyTex === 'player_whale' && lobby.whaleFxTex === 'fx_idle'
  && lobby.zzz === 3 && lobby.fish === 4 && lobby.fishTex === 'goldfish_pink'
  && lobby.streaks === 3 && lobby.streakTex === 'glass_streak', JSON.stringify(lobby));
await page.screenshot({ path: `${OUT}/01-lobby-dynamic.png` });

// 3. 鲸鱼游动（容器位置随时间变化）+ 金鱼巡游
const w1 = await page.evaluate(() => { const s = window.__game.scene.getScene('Menu'); return { wx: s.whaleC.x, fx: s.fish[0].img.x }; });
await page.waitForTimeout(1200);
const w2 = await page.evaluate(() => { const s = window.__game.scene.getScene('Menu'); return { wx: s.whaleC.x, fx: s.fish[0].img.x }; });
rec('鲸鱼游动漂移 + 金鱼巡游移动',
  Math.abs(w2.wx - w1.wx) > 1 && Math.abs(w2.fx - w1.fx) > 1,
  `whaleX ${w1.wx.toFixed(1)}→${w2.wx.toFixed(1)}  fishX ${w1.fx.toFixed(1)}→${w2.fx.toFixed(1)}`);
await page.screenshot({ path: `${OUT}/02-lobby-moved.png` });

// 4. 眨眼（帧率无关，headless 下 game time ≈ 0.31x 墙钟；周期 3.6s 游戏时间 ≈ 11.6s 墙钟，
//     故持续 loop.inFocus 并采样直到覆盖完整周期，观测 fx_idle 与 fx_blink 各至少一次）
const seen = new Set();
const blinkT0 = Date.now();
while (Date.now() - blinkT0 < 22000) {
  await ensureLoopInFocus();
  await page.waitForTimeout(150);
  const t = await page.evaluate(() => window.__game.scene.getScene('Menu').whaleFx.texture.key);
  if (t) seen.add(t);
  if (seen.has('fx_idle') && seen.has('fx_blink')) break;
}
rec('鲸鱼眨眼(采样见 idle+blink)', seen.has('fx_idle') && seen.has('fx_blink'), `seen=[${[...seen].join(',')}]`);

// 5. 皮肤按钮/钩子切换：女仆装 → 饭盆头（完整立绘，不再叠小盆）
const s0 = await page.evaluate(() => window.__MENU_CHAR.state().skin);
await page.evaluate(() => window.__MENU_CHAR.toggleSkin());
await page.waitForTimeout(800);
await ensureLoopInFocus();   // toggleSkin 触发 scene.restart 后再次保持聚焦
const bowl = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Menu');
  const raw = JSON.parse(localStorage.getItem('maidfish-survivor-save-v1'));
  return { skin: window.__MENU_CHAR.state().skin, bodyTex: s.whaleC.list[0].texture.key, rawSkin: raw.skin,
    hasRiceOverlay: s.children.list.some(o => o.texture && o.texture.key === 'rice_bowl') };
});
rec(`皮肤切到饭盆头(完整立绘+写档+无小盆overlay)`,
  s0 === 'maid' && bowl.skin === 'bowl' && bowl.bodyTex === 'player_bowlhead' && bowl.rawSkin === 'bowl' && !bowl.hasRiceOverlay,
  `skin=${bowl.skin} body=${bowl.bodyTex} riceOverlay=${bowl.hasRiceOverlay}`);
await page.screenshot({ path: `${OUT}/03-skin-bowl-full.png` });

// 6. 长按鲸鱼娘切回女仆装（650ms 产品阈值，游戏内累计时间）
// headless 修正：持续保持 loop.inFocus=true（仅测试环境），保证 650ms 产品阈值按游戏内时间真实触发；
// 换装会整页 scene.restart()（重建大厅），故打点 handleSkinClick + 持续采样 s.skin，
// 触发后等一个游戏 tick 再断言，避免重建造成的采样竞态误判。
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Menu');
  window.__ACC = 0; window.__ACC_ON = false;
  if (window.__ACC_LISTEN) s.events.off('update', window.__ACC_LISTEN);
  window.__ACC_LISTEN = (_t, d) => { if (window.__ACC_ON) window.__ACC += d; };
  s.events.on('update', window.__ACC_LISTEN);
  // 打点 handleSkinClick：跨 scene.restart() 仍可确认真实触发与触发时游戏累计
  window.__LP_FIRE = null;
  const orig = s.handleSkinClick.bind(s);
  s.handleSkinClick = () => { window.__LP_FIRE = { acc: window.__ACC }; orig(); };
  // 诊断计数（正式脚本调试用，可留）：容器 pointerdown 是否命中
  window.__HITD = 0;
  s.whaleC.on('pointerdown', () => { window.__HITD++; });
});
const lp0 = await page.evaluate(() => window.__MENU_CHAR.state().skin);
// 真实命中角色：按下前一刻保持 loop.inFocus，动态读取鲸鱼容器命中中心
// （世界变换下局部 (0,0)=鲸鱼视觉中心；命中区已修复居中，用当前变换做一次真实命中验证），
// 立即 move/down，避免 headless 坐标/输入时序竞态；ACC 在按下前归零并开启，
// 覆盖完整按住时段（避免 evaluate 往返造成的测量缺口），产品 650ms 阈值与断言不变。
await ensureLoopInFocus();
const target = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Menu');
  const wc = s.whaleC;
  const m = wc.getWorldTransformMatrix();
  const cx = m.getX(0, 0), cy = m.getY(0, 0);
  const p = s.input.activePointer; p.x = cx; p.y = cy;   // 当前变换命中验证（已修复集中）
  const n = s.input.hitTestPointer(p).length;
  return { x: Math.round(cx), y: Math.round(cy), verified: n > 0 };
});
await page.mouse.move(target.x, target.y);
await page.waitForTimeout(60);   // 短驻留等一次输入处理；鲸鱼漂移 <0.3px，远小于命中区半径
await page.evaluate(() => { window.__ACC = 0; window.__ACC_ON = true; });
await page.mouse.down();
let fired = false, accAtFire = -1, lp1 = lp0;
const t0 = Date.now();
while (Date.now() - t0 < 20000) {
  await ensureLoopInFocus();
  await page.waitForTimeout(120);
  const st = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Menu');
    return { cur: s.skin, lpFire: window.__LP_FIRE, acc: window.__ACC };
  });
  if ((st.lpFire || st.cur !== lp0) && !fired) {
    fired = true;
    // 触发后等一个游戏 tick（scene.restart 重建完成、累计 game delta settle 到位）再断言
    await page.waitForTimeout(150);
    const settle = await page.evaluate(() => {
      const s = window.__game.scene.getScene('Menu');
      return { cur: s.skin, acc: window.__ACC };
    });
    accAtFire = (st.lpFire && st.lpFire.acc != null) ? st.lpFire.acc : settle.acc;
    lp1 = settle.cur;
    break;
  }
}
await page.mouse.up();
await page.waitForTimeout(700);
// [DIAG] 按下后状态
const __diag6 = await page.evaluate(() => {
  const g = window.__game; const s = g.scene.getScene('Menu');
  const p = g.input.activePointer;
  const hits = s.input.hitTestPointer(p);
  return { px: p.x, py: p.y, hits: hits.length, keys: hits.map(h => (h.texture ? h.texture.key : (h.name || 'container')) + '@d' + h.depth), hitd: window.__HITD ?? -1, inFocus: g.loop.inFocus, wx: s.whaleC?.x ?? -1, wy: s.whaleC?.y ?? -1 };
});
console.log('LP-DIAG', JSON.stringify(__diag6));
if (!fired) {
  lp1 = await page.evaluate(() => window.__MENU_CHAR.state().skin);
  var hitd = await page.evaluate(() => window.__HITD ?? -1);   // 未命中诊断（容器 pointerdown 计数）
} else {
  var hitd = -1;
}
rec(`长按鲸鱼娘切回女仆装(650ms产品阈值按游戏内时间) ${lp0}→${lp1}`,
  fired && accAtFire >= 650 && lp1 === 'maid' && lp0 === 'bowl',
  `fired=${fired} gameAccAtFire=${Math.round(accAtFire)}ms ${lp0}→${lp1}${!fired ? ' hitd=' + hitd : ''}`);
await page.screenshot({ path: `${OUT}/04-skin-maid-back.png` });

// 7. 进入战斗：皮肤与大厅一致(女仆装) + 不崩
await page.mouse.click(640, 452);
await page.waitForTimeout(1100);
for (let i = 0; i < 3; i++) { await page.mouse.click(640, 360); await page.waitForTimeout(200); }
await page.waitForTimeout(800);
const game = await page.evaluate(() => {
  const g = window.__game.scene.getScene('Game');
  const active = window.__game.scene.isActive('Game');
  return { active, hasPlayer: !!g?.player, playerTex: g?.player?.sprite?.texture?.key, playerSkin: g?.player?.skinId, elapsed: g?.elapsed ?? -1 };
});
rec('进入战斗(皮肤=女仆装 player_whale, 不崩)', game.active && game.hasPlayer && game.playerSkin === 'maid' && game.playerTex === 'player_whale' && game.elapsed >= 0, JSON.stringify(game));
await page.screenshot({ path: `${OUT}/05-battle-maid.png` });

// 8. 战斗内换肤 → 饭盆头完整立绘（战斗内外一致）
await page.evaluate(() => { const g = window.__game.scene.getScene('Game'); if (g && g.player) g.player.setSkin('bowl'); });
await page.waitForTimeout(200);
const battleBowl = await page.evaluate(() => {
  const g = window.__game.scene.getScene('Game');
  return { tex: g.player.sprite.texture.key, skin: g.player.skinId, bowlOverlayVisible: g.player.bowlSpr.visible };
});
rec('战斗内切饭盆头(player_bowlhead完整立绘, 无overlay)', battleBowl.tex === 'player_bowlhead' && battleBowl.skin === 'bowl' && !battleBowl.bowlOverlayVisible, JSON.stringify(battleBowl));
await page.screenshot({ path: `${OUT}/06-battle-bowl.png` });

// 9. 无页面/控制台错误
const errorsText = errors.slice(0, 5).join(' | ');
rec('无页面/控制台错误', errors.length === 0, errorsText || 'clean');

console.log('\n== 结果汇总 ==');
const fail = results.filter(r => !r[1]).length;
console.log(`PASS ${results.length - fail}/${results.length}`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
