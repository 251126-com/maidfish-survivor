// v0.9.0 新玩法端到端验收：大白饭回血（掉落+升级卡）、饭盆护甲（30 吸收/破碎/恢复立绘）、
// HUD 护甲条、受控随机掉落（window.__DROP_RNG）、对象池回收（多次拾取）、无回归错误。
// 用法：CHROME_PATH=/usr/bin/chromium E2E_URL=http://127.0.0.1:4173/ node e2e/verify-loot.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.E2E_URL || 'http://127.0.0.1:4173/';
const OUT = 'e2e/shots';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const isNoise = (t) => /favicon|404 \(Not Found\)/.test(t);
const results = [];
const check = (name, ok, detail = '') => { results.push([name, !!ok, detail]); console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  [' + detail + ']' : ''}`); };

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !isNoise(m.text())) errors.push(`[console.error] ${m.text()}`); });

// ---------- 0. 版本与部署标记 ----------
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const ver = await page.evaluate(() => window.__VERSION ?? null);
check('版本标记 __VERSION=0.11.0', ver === '0.11.0', `实际 ${ver}`);
const lootMark = await page.evaluate(() => window.__LOOT_MARK ?? null);
check('__LOOT_MARK 版本/概率/回血/护甲/开局护盾常量',
  !!lootMark && lootMark.version === '0.11.0' && lootMark.riceChance === 0.015 && lootMark.bowlChance === 0.0035 && lootMark.riceHeal === 20 && lootMark.armorMax === 30 && lootMark.starterArmor === 20,
  `实际 ${JSON.stringify(lootMark)}`);
check('掉落概率极低且饭盆更稀有', !!lootMark && lootMark.bowlChance < lootMark.riceChance);

// ---------- 1. 进入游戏 ----------
await page.mouse.click(640, 230);
await page.waitForTimeout(1500);

// 冻结刷怪并清空场上敌人：受击/回血断言必须不被敌人触撞干扰（无敌帧由测试显式控制）
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.spawnTimer = 99999;
  s.bossSpawned = true;
  for (const e of s.enemies.pool.live) { e.active = false; e.hp = 0; }
});

// 工具：杀一只怪并使指定 type 的掉落出现在场上
async function killEnemy(kind) {
  return await page.evaluate((kind) => {
    const s = window.__game.scene.getScene('Game');
    const e = s.enemies.spawn('fish', s.player.x + 90, s.player.y, s.elapsed);
    if (!e) return { err: 'no enemy spawned' };
    e.hp = 1; e.maxHp = 1;
    s.weapons.applyDamage(e, 9999, s.enemies, s.player);
    const drop = s.drops.pool.live.find(g => g.active && g.kind === kind);
    if (!drop) return { err: `no drop '${kind}'`, live: s.drops.pool.live.map(g => g.kind) };
    return { x: drop.x, y: drop.y };
  }, kind);
}
// 工具：把玩家瞬移到掉落点触发拾取
async function moveToDrop(pos) {
  await page.evaluate(({ x, y }) => {
    const s = window.__game.scene.getScene('Game');
    s.player.x = x; s.player.y = y;
    s.player.sprite.setPosition(x, y);
  }, pos);
  await page.waitForTimeout(350);
}
// 工具：玩家当前状态
const readState = () => page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const p = s.player;
  return {
    hp: p.stats.hp,
    maxHp: p.stats.maxHp,
    armor: p.armor.armor,
    armorMax: p.armor.max,
    hasBowl: p.hasBowl,
    bowlVisible: p.bowlSpr.visible,
    hudArmorText: s.hud.armorText.text,
    hudHpText: s.hud.hpText.text,
    panelVisible: s.panel.visible
  };
});

// ========== A. 饭盆护甲：掉/拾取/吸收/破碎/恢复 ==========
console.log('\n===== A. 饭盆护甲 =====');
// 受控掷骰：强制掉饭盆（r < bowlChance）
await page.evaluate((bowl) => { window.__DROP_RNG = () => bowl / 2; }, lootMark.bowlChance);
let pos = await killEnemy('bowl');
check('击杀后受控掉落饭盆', !pos.err, JSON.stringify(pos));
let st = await readState();
check('开局自带护盾 20/30（饭盆头可见）', st.armor === 20 && st.hasBowl && st.bowlVisible === true,
  `armor=${st.armor} bowl=${st.bowlVisible}`);
if (!pos.err) await moveToDrop(pos);
st = await readState();
check('拾取饭盆 → 护甲 30 + 饭盆头显示', st.armor === 30 && st.hasBowl && st.bowlVisible === true,
  `armor=${st.armor} bowl=${st.bowlVisible}`);
check('HUD 显示护甲条文本', /护甲 30 \/ 30/.test(st.hudArmorText), st.hudArmorText);
await page.screenshot({ path: `${OUT}/40-bowl-on.png` });

// 受击优先扣甲：扣 10，HP 不变，护甲 20（原子化：清无敌帧→施伤→同帧读状态，无时序抖动）
const hit1 = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.player.invuln = 0;
  s.player.takeDamage(10);
  return { armor: s.player.armor.armor, hp: s.player.stats.hp, bowl: s.player.bowlSpr.visible };
});
check('受击 10 优先扣甲：HP 不变、护甲 20（拾取后 30→20）', hit1.armor === 20 && hit1.hp === 100, `armor=${hit1.armor} hp=${hit1.hp}`);
await page.waitForTimeout(120);   // 等 HUD 下一帧刷新
const hudAfterHit = await page.evaluate(() => window.__game.scene.getScene('Game').hud.armorText.text);
check('HUD 护甲条更新为 20/30', /护甲 20 \/ 30/.test(hudAfterHit), hudAfterHit);
await page.screenshot({ path: `${OUT}/41-armor-absorb.png` });

// 再受击 30：护甲 20 吸收 20，溢出 10 落 HP → broken → 恢复普通立绘
const hit2 = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.player.invuln = 0;
  const before = s.player.stats.hp;
  s.player.takeDamage(30);
  return { armor: s.player.armor.armor, before, hp: s.player.stats.hp, hasBowl: s.player.hasBowl, bowl: s.player.bowlSpr.visible };
});
check('破甲：护甲 0、HP 扣 10、饭盆消失恢复原立绘', hit2.armor === 0 && hit2.hp === hit2.before - 10 && !hit2.hasBowl && hit2.bowl === false,
  `armor=${hit2.armor} hp=${hit2.hp} bowl=${hit2.bowl}`);
await page.waitForTimeout(120);
const hudAfterBreak = await page.evaluate(() => window.__game.scene.getScene('Game').hud.armorText.text);
check('HUD 破甲后隐藏护甲文本', hudAfterBreak === '', hudAfterBreak);
await page.screenshot({ path: `${OUT}/42-bowl-broken.png` });

// 再次拾取（刷新规则：0→30 为 new；再捡已满 → full 不叠加）
pos = await killEnemy('bowl');
if (!pos.err) await moveToDrop(pos);
st = await readState();
check('再次拾取饭盆 → 护甲恢复 30', st.armor === 30 && st.bowlVisible);
const hpBeforeFullPickup = st.hp;
pos = await killEnemy('bowl');
if (!pos.err) await moveToDrop(pos);
st = await readState();
check('护甲已满再拾取 → 不叠加仍 30 且 HP 不变', st.armor === 30 && st.hp === hpBeforeFullPickup,
  `armor=${st.armor} hp=${st.hp}`);
await page.screenshot({ path: `${OUT}/43-bowl-refill.png` });

// ========== B. 大白饭掉落回血 ==========
console.log('\n===== B. 大白饭掉落回血 =====');
// 先把血打到 60（回血可测且钳制在上限 100）
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.player.stats.hp = 60;            // 测试态：摆到 60，不触发结算
});
await page.waitForTimeout(800);
await page.evaluate(({ b, r }) => { window.__DROP_RNG = () => b + r / 2; }, { b: lootMark.bowlChance, r: lootMark.riceChance });
pos = await killEnemy('rice');
check('受控掉落大白饭', !pos.err, JSON.stringify(pos));
if (!pos.err) await moveToDrop(pos);
st = await readState();
check('拾取大白饭 → 回血 20', st.hp === 80, `hp=${st.hp}`);
await page.screenshot({ path: `${OUT}/44-rice-heal.png` });

// 满血时拾取 → clamp 到上限 100
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.player.stats.hp = 95;
});
pos = await killEnemy('rice');
if (!pos.err) await moveToDrop(pos);
st = await readState();
check('回血 clamp：95+20 不超 100', st.hp === 100 && st.hp <= st.maxHp, `hp=${st.hp} max=${st.maxHp}`);

// ========== C. 升级卡「大白饭」 ==========
console.log('\n===== C. 升级回血技能 → 大白饭 =====');
// 摆低血量后升级：选「大白饭」应回血且不超新上限
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.player.stats.hp = 50;
  window.__UPGRADE_FORCE_ID = 'hp';   // 测试钩子：保证三卡面板必含「大白饭」（线上无此钩子时随机）
  s.levelSys.addXp(999999);
});
await page.waitForTimeout(900);   // 等升级面板淡入结束
const cardInfo = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return s.panel.visible
    ? s.panel.cards.map((c, i) => ({ i, name: c.name.text, desc: c.desc.text, x: c.bg.x, y: c.bg.y }))
    : [];
});
check('升级面板出现三卡', cardInfo.length === 3, `cards=${cardInfo.length}`);
check('面板含「大白饭」回血卡', cardInfo.some(c => /大白饭/.test(c.name)), JSON.stringify(cardInfo.map(c => c.name)));
const riceCard = cardInfo.find(c => /大白饭/.test(c.name));
if (riceCard) {
  await page.mouse.click(riceCard.x, riceCard.y);
  await page.waitForTimeout(700);
  st = await readState();
  check('选「大白饭」→ 上限+20 且回血 20（50→70）', st.maxHp === 120 && st.hp === 70, `max=${st.maxHp} hp=${st.hp}`);
  await page.screenshot({ path: `${OUT}/45-levelup-rice.png` });
}
// 结束升级连环弹窗 + 清理升级钩子，避免影响后续
await page.evaluate(() => {
  window.__UPGRADE_FORCE_ID = undefined;
  window.__game.scene.getScene('Game').levelSys.pending = 0;
});

// ========== D. 暂停/重开等不回归（悬浮球/背景由各自脚本覆盖） ==========
console.log('\n===== D. 运行时健康 =====');
const jsErrors = errors.filter(e => /TypeError|ReferenceError|Cannot read/.test(e));
check('无 JS 运行时错误', jsErrors.length === 0, jsErrors.slice(0, 5).join('; '));

// 收集屏幕截图清单
const shots = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter(f => f.endsWith('.png')).sort() : [];
console.log('本轮截图:', shots.slice(-6).join(', '));
await browser.close();

console.log('\n===== v0.11.0 新玩法验收 ====');
let allPass = true;
for (const [name, ok, detail] of results) {
  console.log(`${ok ? '✔' : '✘'} ${name}`);
  if (!ok) allPass = false;
}
if (errors.length) {
  console.log('\n捕获到的错误:');
  for (const e of errors.slice(0, 10)) console.log('  ' + e);
}
console.log(`\n结论: ${allPass ? '全部通过' : '存在失败项'}`);
process.exit(allPass ? 0 : 1);
