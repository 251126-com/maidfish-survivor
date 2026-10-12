// 进化链路端到端验证：真浏览器里跑满武器 + 钥匙被动，确认进化选项出现且生效
// 用法：CHROME_PATH=/usr/bin/chromium E2E_URL=http://127.0.0.1:4174/ node e2e/verify-evolution.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.E2E_URL || 'http://127.0.0.1:4173/';
const OUT = 'e2e/shots';
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const isNoise = (t) => /favicon|404 \(Not Found\)/.test(t);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('console', m => {
  if (m.type() === 'error' && !isNoise(m.text())) errors.push(`[console.error] ${m.text()}`);
});

const readCards = () => page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return s.panel.visible ? s.panel.cards.map(c => c.name.text) : null;
});

const readWeapons = () => page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return s.weapons.owned.map(w => `${w.def.id}Lv${w.level}`);
});

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.mouse.click(640, 230);          // 开始游戏（同时解锁音频）
await page.waitForTimeout(1200);

// ---------- 场景 1：步枪 → 鲸波轨道枪 ----------
console.log('→ 场景1：步枪满级 + 瞄准镜，检查进化选项');
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.weapons.owned.length = 0;              // 清空重来，排除随机因素
  s.weapons.addWeapon('rifle');
  for (let i = 1; i < 5; i++) s.weapons.upgradeWeapon('rifle');
  s.passives.scope = 1;                    // 钥匙被动到手
  s.levelSys.addXp(s.levelSys.need, 1);    // 触发一次升级
});
await page.waitForTimeout(500);
const cards1 = await readCards();
console.log('   卡片:', JSON.stringify(cards1));
const hasEvoCard1 = !!cards1 && cards1.some(t => t.includes('鲸波轨道枪'));
await page.screenshot({ path: `${OUT}/10-evo-offer.png` });

// 进化选项固定占第一张卡，直接点它
await page.mouse.click(280, 390);
await page.waitForTimeout(600);
const weapons1 = await readWeapons();
console.log('   进化后武器:', JSON.stringify(weapons1));
const evolved1 = weapons1.some(w => w.startsWith('railgun'));
await page.screenshot({ path: `${OUT}/11-evo-done.png` });

// ---------- 场景 2：狙击枪 → 大肥鱼炮（含溅射字段） ----------
console.log('→ 场景2：狙击枪满级 + 女仆头饰');
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.weapons.owned.length = 0;
  s.weapons.addWeapon('sniper');
  for (let i = 1; i < 5; i++) s.weapons.upgradeWeapon('sniper');
  s.passives.maidband = 1;
  s.levelSys.addXp(s.levelSys.need, 1);
});
await page.waitForTimeout(500);
const cards2 = await readCards();
console.log('   卡片:', JSON.stringify(cards2));
const hasEvoCard2 = !!cards2 && cards2.some(t => t.includes('大肥鱼炮'));

await page.mouse.click(280, 390);
await page.waitForTimeout(600);
const weapons2 = await readWeapons();
console.log('   进化后武器:', JSON.stringify(weapons2));
const evolved2 = weapons2.some(w => w.startsWith('fatfishCannon'));

// 溅射：炮弹命中时应对周围敌人造成范围伤害
console.log('→ 验证溅射范围伤害');
const splashHp = await page.evaluate(async () => {
  const s = window.__game.scene.getScene('Game');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const pre = { hp: Math.round(s.stats.hp), isOver: s.isOver, active: s.scene.isActive(), weapons: s.weapons.owned.map(w => w.def.id) };
  // 保命：测试期间玩家无敌，避免被这群高血量靶子打死导致游戏结束、世界停更
  s.isOver = false;
  s.stats.hp = s.stats.maxHp;
  const keepAlive = setInterval(() => { s.player.invuln = 5; s.stats.hp = s.stats.maxHp; }, 60);

  // 造一排挤在一起的靶子，血量拉高避免被打死导致统计错位
  const targets = [];
  for (let i = 0; i < 6; i++) {
    const e = s.enemies.spawn('fish', s.player.x + 150, s.player.y + (i - 2.5) * 22, s.elapsed);
    if (e) { e.hp = 100000; e.maxHp = 100000; targets.push(e); }
  }
  // 清掉场上其他敌人：否则子弹会优先打离得更近的那个，测不出溅射
  const keepSet = new Set(targets);
  for (const e of s.enemies.live.slice()) {
    if (!keepSet.has(e)) s.enemies.pool.release(e);
  }

  await sleep(2600);
  clearInterval(keepAlive);
  const alive = new Map(s.enemies.live.map(e => [e.uid, e.hp]));
  const damaged = targets.filter(e => {
    const h = alive.get(e.uid);
    return h !== undefined && h < 100000;
  }).length;
  return { pre, targets: targets.length, damaged, bullets: s.weapons.bulletCount };
});
console.log('   溅射结果:', JSON.stringify(splashHp));

// ---------- 音效系统 ----------
const audioState = await page.evaluate(() => {
  const sfx = window.__sfx;
  if (!sfx) return { exposed: false };
  return { exposed: true, enabled: sfx.enabled, ctxState: sfx.ctx ? sfx.ctx.state : null };
});
console.log('   音效状态:', JSON.stringify(audioState));

// ---------- 鲸鱼娘贴图 ----------
const hasWhaleTexture = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return s.textures.exists('player_whale');
});
console.log('   鲸鱼娘贴图存在:', hasWhaleTexture);

await page.screenshot({ path: `${OUT}/12-final.png` });
await browser.close();

const checks = [
  ['步枪满级+瞄准镜 → 出现进化选项', hasEvoCard1],
  ['点击后武器变为鲸波轨道枪', evolved1],
  ['狙击枪满级+头饰 → 出现进化选项', hasEvoCard2],
  ['点击后武器变为大肥鱼炮', evolved2],
  ['溅射炮弹命中多个敌人', splashHp.damaged >= 2],
  ['音效系统已暴露', audioState.exposed === true],
  ['AudioContext 已解锁并运行', audioState.ctxState === 'running'],
  ['主角贴图为鲸鱼娘', hasWhaleTexture],
  ['无 JS 运行时错误', errors.length === 0]
];

console.log('\n===== 进化链路验证 =====');
let allPass = true;
for (const [name, ok] of checks) {
  console.log(`${ok ? '✔' : '✘'} ${name}`);
  if (!ok) allPass = false;
}
if (errors.length) {
  console.log('\n捕获到的错误:');
  for (const e of errors.slice(0, 10)) console.log('  ' + e);
}
console.log(`\n结论: ${allPass ? '全部通过' : '存在失败项'}`);
process.exit(allPass ? 0 : 1);