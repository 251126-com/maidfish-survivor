// v0.14.0 冒烟：大厅鱼缸睡觉画面 / 角色解锁选择 / 皮肤切换(女仆装默认) /
// 战斗内枪口不再变红 / 旧存档 v1→v2 兼容 / 版本标记
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.E2E_URL || 'http://127.0.0.1:4173/';
const OUT = 'e2e/shots/v0140';
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
rec('版本标记 __VERSION', ver === '0.14.0', `ver=${ver}`);

// 2. 大厅：MenuScene 存在鱼缸睡觉画面（player_whale + fx_blink 闭眼 + Zzz 文字）
const lobby = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Menu');
  const kids = s.children.list;
  const hasWhale = kids.some(o => o.texture && o.texture.key === 'player_whale');
  const hasBlink = kids.some(o => o.texture && o.texture.key === 'fx_blink');
  const hasZ = kids.some(o => o.text && /z|Z/.test(String(o.text)));
  return { hasWhale, hasBlink, hasZ, charC: !!s.charC, tab: s.tabC };
});
rec('大厅鱼缸睡觉画面', lobby.hasWhale && lobby.hasBlink && lobby.hasZ && lobby.charC, JSON.stringify(lobby));
await page.screenshot({ path: `${OUT}/01-lobby-fishtank.png` });

// 3. 角色页初始状态：默认角色 whale 已解锁使用中，皮肤默认女仆装
const initState = await page.evaluate(() => window.__MENU_CHAR.state());
rec('默认角色/皮肤(女仆装)', initState.charId === 'whale' && initState.skin === 'maid' && initState.unlocked.includes('whale'), JSON.stringify(initState));
await page.screenshot({ path: `${OUT}/02-char-page-default.png` });

// 4. 旧存档 v1→v2 兼容：金币/强化/最佳保留，新增字段补默认
await page.evaluate(() => {
  localStorage.setItem('maidfish-survivor-save-v1', JSON.stringify({
    version: 1, gold: 777, meta: { meta_atk: 2 }, best: { time: 120, kills: 30, level: 8 }
  }));
});
await page.reload();
await page.waitForTimeout(1400);
const mig = await page.evaluate(() => window.__MENU_CHAR.state());
rec('旧存档v1兼容(金币/强化/默认字段)', mig.gold === 777 && mig.skin === 'maid' && mig.unlocked.length === 1 && mig.unlocked[0] === 'whale' && mig.charId === 'whale', JSON.stringify(mig));

// 5. 角色解锁：金币 777 → 解锁 fat(400) 自动选用，金币 777-400=377
await page.evaluate(() => window.__MENU_CHAR.unlock('fat'));
await page.waitForTimeout(300);
const afterFat = await page.evaluate(() => window.__MENU_CHAR.state());
rec('解锁胖鱼娘并自动选用', afterFat.charId === 'fat' && afterFat.unlocked.includes('fat') && afterFat.gold === 377, JSON.stringify(afterFat));
const mig2 = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('maidfish-survivor-save-v1'));
  return { version: raw.version, gold: raw.gold, meta_atk: raw.meta.meta_atk, best_time: raw.best.time, unlocked: raw.unlocked };
});
rec('写档后升级v2且数据保留', mig2.version === 2 && mig2.gold === 377 && mig2.meta_atk === 2 && mig2.best_time === 120 && mig2.unlocked.includes('fat'), JSON.stringify(mig2));
await page.screenshot({ path: `${OUT}/03-char-unlock-fat.png` });

// 6. 金币不足不解锁：eel(800) 当前 377 不够 → charId 保持 fat
await page.evaluate(() => window.__MENU_CHAR.unlock('eel'));
await page.waitForTimeout(300);
const afterEel = await page.evaluate(() => window.__MENU_CHAR.state());
rec('金币不足不解锁', afterEel.charId === 'fat' && !afterEel.unlocked.includes('eel'), JSON.stringify(afterEel));

// 7. 注入足够金币 → 解锁 eel → 自动选用
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('maidfish-survivor-save-v1'));
  s.gold = 9999; localStorage.setItem('maidfish-survivor-save-v1', JSON.stringify(s));
});
await page.reload();
await page.waitForTimeout(1200);
await page.evaluate(() => window.__MENU_CHAR.unlock('eel'));
await page.waitForTimeout(300);
const afterEel2 = await page.evaluate(() => window.__MENU_CHAR.state());
rec('解锁电鳗娘并自动选用', afterEel2.charId === 'eel' && afterEel2.unlocked.includes('eel') && afterEel2.unlocked.length === 3, JSON.stringify(afterEel2));
await page.screenshot({ path: `${OUT}/04-char-unlock-eel.png` });

// 8. 皮肤切换：默认 maid → toggle → bowl → 再 toggle → maid
await page.evaluate(() => window.__MENU_CHAR.toggleSkin());
await page.waitForTimeout(200);
const skinBowl = await page.evaluate(() => window.__MENU_CHAR.state());
rec('皮肤切到饭盆头', skinBowl.skin === 'bowl', JSON.stringify(skinBowl));
await page.screenshot({ path: `${OUT}/05-skin-bowl.png` });
await page.evaluate(() => window.__MENU_CHAR.toggleSkin());
await page.waitForTimeout(200);
const skinMaid = await page.evaluate(() => window.__MENU_CHAR.state());
rec('皮肤切回女仆装(默认)', skinMaid.skin === 'maid', JSON.stringify(skinMaid));

// 9. tab 切换：角色页 ↔ 强化页（隐藏页守卫）
await page.evaluate(() => window.__MENU_CHAR.switchTab('shop'));
await page.waitForTimeout(200);
const shopTab = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Menu');
  return { tab: s.tabC, shopVis: s.shopC.visible, charVis: s.charC.visible };
});
rec('tab切到强化页', shopTab.tab === 'shop' && shopTab.shopVis && !shopTab.charVis, JSON.stringify(shopTab));
await page.screenshot({ path: `${OUT}/06-shop-tab.png` });
await page.evaluate(() => window.__MENU_CHAR.switchTab('char'));

// 10. 进入战斗：开局引导跳过 → 制造连杀 → 枪口不再变红（tint=0xffffff）
await page.mouse.click(640, 230);
await page.waitForTimeout(700);
for (let i = 0; i < 4; i++) { await page.mouse.click(640, 360); await page.waitForTimeout(150); }
await page.waitForTimeout(600);
const gunIdle = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { gunTint: s.player.gun.tint };
});
const streakKill = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  for (let i = 0; i < 7; i++) {
    const e = s.enemies.spawn('fish', s.player.x + 80 + i * 30, s.player.y, s.elapsed);
    if (e) { e.hp = 1; s.weapons.applyDamage(e, 999, s.enemies, s.player); }
  }
  return { streak: s.killStreak ? s.killStreak.current : -1, gunTint: s.player.gun.tint, edgeAlpha: s.streakEdge.alpha, skin: s.player.skinId };
});
rec('连杀后枪口不变红+边缘泛红减弱', streakKill.streak >= 5 && streakKill.gunTint === 0xffffff && streakKill.edgeAlpha > 0 && streakKill.edgeAlpha <= 0.12, JSON.stringify(streakKill));
rec('战斗内皮肤=存档皮肤(女仆装)', streakKill.skin === 'maid', `skin=${streakKill.skin}`);
await page.screenshot({ path: `${OUT}/07-battle-no-gun-red.png` });

// 11. 无页面/控制台错误
const errorsText = errors.slice(0, 5).join(' | ');
rec('无页面/控制台错误', errors.length === 0, errorsText || 'clean');
console.log('\n== 结果汇总 ==');
const fail = results.filter(r => !r[1]).length;
console.log(`PASS ${results.length - fail}/${results.length}`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
