// v0.15.0 冒烟：鱼缸大厅视觉 / 开始游戏 / 女仆装默认 / 饭盆头切换+长按 /
// 旧存档 fat/eel 回落退款 / 退款稳定(重复刷新不通胀) / 战斗角色/皮肤 / 无页面错误
//
// == 测试环境修正（仅验收脚本，不改产品代码）==
// headless Chromium 下 Page Visibility API 常把页面视为失焦：Phaser TimeStep.inFocus=false，
// 且 blur/focus 轮流触发会把 _coolDown 重置为 panicMax(120)，smoothDelta 期间每帧 delta 被钳到
// ~16.67ms(_target)。此时 650ms Product 阈值计时（Clock 按 smoothed delta 累加 event.elapsed）
// 需按「游戏内累计时间」而非真实墙钟时间才能可靠触发。
// 修正：显式置 loop.inFocus=true（等价于真实用户聚焦页面），并按游戏内累计 delta 等待触发；
// 产品阈值 650ms 保持不变、不缩短、不伪造。
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.E2E_URL || 'http://127.0.0.1:4199/';
const OUT = 'e2e/shots/v0150';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const isNoise = (t) => /favicon|404 \(Not Found\)/.test(t);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => { window.__CHAR_STATE = {}; });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !isNoise(m.text())) errors.push(`[console.error] ${m.text()}`); });
const results = [];
const rec = (name, ok, detail='') => { results.push([name, ok, detail]); console.log(`${ok?'✔':'✘'} ${name}${detail?'  '+detail:''}`); };
const KEY = 'maidfish-survivor-save-v1';
const skinOf = () => page.evaluate(() => window.__MENU_CHAR.state().skin);

// 测试环境修正：headless 页面视为失焦 → 置 inFocus=true（真实用户聚焦页面的等价修正）
await page.addInitScript(() => {
  window.__TEST_ENV_INFOCUS_FIXED = false;
});
async function ensureLoopInFocus() {
  await page.evaluate(() => {
    const loop = window.__game?.loop;
    if (loop && loop.inFocus === false) {
      loop.inFocus = true;               // 仅测试环境修正 headless 失焦
      window.__TEST_ENV_INFOCUS_FIXED = true;
    }
  });
}

// 1. 版本标记
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const ver = await page.evaluate(() => window.__VERSION ?? null);
rec('版本标记 __VERSION=0.15.0', ver === '0.15.0', `ver=${ver}`);

// 2. 鱼缸大厅视觉
const lobby = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Menu');
  const kids = s.children.list;
  return {
    grad: kids.some(o => o.texture && o.texture.key === 'lobby_grad'),
    whale: kids.some(o => o.texture && o.texture.key === 'player_whale'),
    blink: kids.some(o => o.texture && o.texture.key === 'fx_blink'),
    hasZ: kids.some(o => o.text && /z/i.test(String(o.text))),
    bubbles: kids.filter(o => o.type === 'Arc').length,
    seaweeds: s.seaweeds ? s.seaweeds.length : 0
  };
});
rec('鱼缸大厅视觉(水面+鲸鱼娘+闭眼+Zzz+气泡+水草)', lobby.grad && lobby.whale && lobby.blink && lobby.hasZ && lobby.bubbles > 3 && lobby.seaweeds > 0, JSON.stringify(lobby));
await page.screenshot({ path: `${OUT}/01-lobby-fishtank.png` });

// 3. 默认状态：女仆装、唯一鲸鱼娘
const initState = await page.evaluate(() => window.__MENU_CHAR.state());
rec('默认：女仆装+唯一鲸鱼娘(whale)', initState.charId === 'whale' && initState.skin === 'maid' && initState.unlocked.length === 1 && initState.unlocked[0] === 'whale', JSON.stringify(initState));
await page.screenshot({ path: `${OUT}/02-lobby-default.png` });

// 4. 旧 v2 存档 fat/eel 回落退款
await page.evaluate((K) => {
  localStorage.setItem(K, JSON.stringify({
    version: 2, gold: 123, meta: { meta_atk: 2 },
    best: { time: 120, kills: 30, level: 8 },
    unlocked: ['whale', 'fat', 'eel'], charId: 'eel', skin: 'bowl'
  }));
}, KEY);
await page.reload();
await page.waitForTimeout(1400);
const mig = await page.evaluate(() => {
  const s = window.__MENU_CHAR.state();
  const raw = JSON.parse(localStorage.getItem('maidfish-survivor-save-v1'));
  return { state: s, rawVersion: raw.version, rawUnlocked: raw.unlocked, rawGold: raw.gold, rawMetaAtk: raw.meta?.meta_atk, rawBestTime: raw.best?.time };
});
rec('旧存档回落退款(gold 123→1323, 仅whale, 皮肤保留bowl)', mig.state.gold === 1323 && mig.state.charId === 'whale' && mig.state.unlocked.length === 1 && mig.state.unlocked[0] === 'whale' && mig.state.skin === 'bowl', JSON.stringify(mig.state));
rec('强化/最佳不丢(meta_atk=2, best.time=120)', mig.rawMetaAtk === 2 && mig.rawBestTime === 120, `meta_atk=${mig.rawMetaAtk} best.time=${mig.rawBestTime}`);
await page.screenshot({ path: `${OUT}/03-old-save-refund.png` });

// 5. 退款稳定：重复刷新不通胀（退款按原始基数+退款计算，非累计叠加）
await page.reload();
await page.waitForTimeout(1400);
const mig2 = await page.evaluate(() => window.__MENU_CHAR.state());
rec('重复刷新金币稳定(1323不涨)', mig2.gold === 1323, `gold=${mig2.gold}`);

// 6. 皮肤切换（读当前值→断言翻转）：当前为 bowl → toggle → maid → toggle → bowl
const s0 = await skinOf();
await page.evaluate(() => window.__MENU_CHAR.toggleSkin());
await page.waitForTimeout(700);
const s1 = await skinOf();
rec(`皮肤按钮切换 ${s0}→${s1}`, s0 !== s1 && s1 === (s0 === 'maid' ? 'bowl' : 'maid'), `${s0}→${s1}`);
await page.screenshot({ path: `${OUT}/04-skin-after-toggle.png` });
const s2 = await skinOf();
await page.evaluate(() => window.__MENU_CHAR.toggleSkin());
await page.waitForTimeout(700);
const s3 = await skinOf();
rec(`皮肤按钮切回 ${s2}→${s3}`, s2 !== s3 && s3 === (s2 === 'maid' ? 'bowl' : 'maid'), `${s2}→${s3}`);
await page.screenshot({ path: `${OUT}/05-skin-after-toggle-back.png` });

// 7. 长按鲸鱼娘切换皮肤——产品阈值 650ms（游戏内累计时间），不缩短不伪造
await ensureLoopInFocus();
// 7a. 定位鲸鱼娘（动态坐标，避免硬编码偏移）
const whalePos = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Menu');
  const w = s.children.list.find(o => o.texture && o.texture.key === 'player_whale');
  return { x: Math.round(w.x), y: Math.round(w.y) };
});
// 7b. 挂游戏内累计 delta 采集器：与 Phaser Clock 喂给延时事件 elapsed 的 smoothed delta 同源
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Menu');
  window.__ACC = 0;
  window.__ACC_ON = false;
  if (window.__ACC_LISTEN) s.events.off('update', window.__ACC_LISTEN);
  window.__ACC_LISTEN = (_t, d) => { if (window.__ACC_ON) window.__ACC += d; };
  s.events.on('update', window.__ACC_LISTEN);
});
const lp0 = await skinOf();
await page.mouse.move(whalePos.x, whalePos.y);
await page.mouse.down();
await page.evaluate(() => { window.__ACC = 0; window.__ACC_ON = true; });
// 7c. 按住直到触发（游戏内累计 ≥650ms 自然触发，轮询兜底 25s 真实时间）
let fired = false, accAtFire = -1;
const t0 = Date.now();
while (Date.now() - t0 < 25000) {
  await ensureLoopInFocus();                    // 防 headless 中途再次失焦把 delta 钳小
  await page.waitForTimeout(120);
  const st = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Menu');
    return { cur: s.skin, acc: window.__ACC };
  });
  if (st.cur !== lp0) { fired = true; accAtFire = st.acc; break; }
}
await page.mouse.up();
await page.waitForTimeout(700);
const lp1 = await skinOf();
const accRounded = Math.round(accAtFire);
rec(`长按鲸鱼娘切换皮肤(650ms产品阈值按游戏内时间触发 ${lp0}→${lp1})`,
  fired && accAtFire >= 650 && lp1 === (lp0 === 'maid' ? 'bowl' : 'maid'),
  `fired=${fired} gameAccAtFire=${accRounded}ms(阈值650ms) ${lp0}→${lp1}`);
await page.screenshot({ path: `${OUT}/06-longpress-toggle.png` });

// 8. 女仆装默认：确保进入战斗前为 maid（若为 bowl 则切换一次）
let pre = await skinOf();
if (pre !== 'maid') { await page.evaluate(() => window.__MENU_CHAR.toggleSkin()); await page.waitForTimeout(700); pre = await skinOf(); }
rec('进入战斗前皮肤=女仆装(默认)', pre === 'maid', `skin=${pre}`);
await page.screenshot({ path: `${OUT}/07-lobby-maid-before-battle.png` });

// 9. 开始游戏 → 跳过开局漫画 → 战斗
await page.mouse.click(640, 452);
await page.waitForTimeout(900);
for (let i = 0; i < 3; i++) { await page.mouse.click(640, 360); await page.waitForTimeout(250); }
await page.waitForTimeout(800);
const game = await page.evaluate(() => {
  const g = window.__game.scene.getScene('Game');
  const active = window.__game.scene.isActive('Game');
  return { active, hasPlayer: !!g?.player, ch: window.__CHAR_STATE, playerSkin: g?.player?.skinId };
});
rec('进入战斗(唯一鲸鱼娘+步枪+女仆装)', game.active && game.hasPlayer && game.ch?.charId === 'whale' && game.ch?.weaponId === 'rifle' && game.ch?.skin === 'maid' && game.playerSkin === 'maid', JSON.stringify(game.ch) + ` playerSkin=${game.playerSkin}`);
await page.screenshot({ path: `${OUT}/08-battle-start.png` });

// 10. 无页面/控制台错误
const errorsText = errors.slice(0, 5).join(' | ');
rec('无页面/控制台错误', errors.length === 0, errorsText || 'clean');

console.log('\n== 结果汇总 ==');
const fail = results.filter(r => !r[1]).length;
console.log(`PASS ${results.length - fail}/${results.length}`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
