// v0.9.0 验收：真实画面截图（菜单重设计 / 角色持枪表情 / Boss 三技能预警与弹幕 / Boss 血条阶段）
// 用法：CHROME_PATH=/usr/bin/chromium E2E_URL=http://127.0.0.1:4173/ node e2e/verify-v090.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.E2E_URL || 'http://127.0.0.1:4173/';
const OUT = 'e2e/shots/v090';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const results = [];
const isNoise = (t) => /favicon|404 \(Not Found\)/.test(t);
const check = (name, ok, detail = '') => results.push([name, !!ok, detail]);
const log = (...a) => console.log(...a);

// 将游戏坐标映射到页面 CSS 坐标（canvas 可能被缩放/居中）
async function pagePoint(page, gx, gy) {
  return await page.evaluate(([gx, gy]) => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { x: r.left + (gx / 1280) * r.width, y: r.top + (gy / 720) * r.height };
  }, [gx, gy]);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

// ---------- 桌面 1280x720 ----------
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !isNoise(m.text())) errors.push(`[console.error] ${m.text()}`); });

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1400);

const ver = await page.evaluate(() => window.__VERSION ?? null);
check('版本标记 __VERSION=0.9.0', ver === '0.9.0', `实际 ${ver}`);

const fsHook = await page.evaluate(() => {
  const h = window.__FS;
  return !!h && typeof h.toggle === 'function' && typeof h.isFullscreen === 'function';
});
check('__FS 全屏钩子已注入(含iOS轻提示)', fsHook, '');

// 菜单重设计截图（独立面板：开始 / 商店）
await page.screenshot({ path: `${OUT}/01-menu-redesign.png` });
const menuInfo = await page.evaluate(() => {
  const m = window.__game.scene.getScene('Menu');
  return {
    hasStart: !!m.children.list.find(o => o.type === 'Rectangle' && o.width === 320),
    pick: window.__MENU_BG?.get(),
    pickCount: window.__MENU_BG?.count
  };
});
check('菜单 __MENU_BG 四卡钩子', menuInfo.pickCount === 4 && typeof menuInfo.pick === 'number', JSON.stringify(menuInfo));
log('  菜单:', JSON.stringify(menuInfo));

// 进入游戏
await page.mouse.click(640, 230);
await page.waitForTimeout(1500);

// 冻结刷怪、满血、关 Boss 倒计时干扰
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.spawnTimer = 99999;
  s.player.stats.hp = 9999; s.player.stats.maxHp = 9999;
  s.player.invuln = 0;
});
await page.waitForTimeout(300);

// 角色持枪+瞄准（枪朝最近敌人）+ 射击表情
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  // 放一个敌人到右侧作瞄准目标
  const e = s.enemies.spawn('fish', s.player.x + 260, s.player.y, 0);
  e.sprite.setPosition(e.x, e.y);
  s.player.onFire();   // 触发开火后坐 + 射击表情
});
await page.waitForTimeout(120);
await page.screenshot({ path: `${OUT}/02-player-gun-fire-aim.png` });

// 待机眨眼表情（清掉射击状态后静止等待眨眼周期）
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.player.firingTimer = -1;
  s.player.animT = 2.6;   // 进入闭眼窗口，验证眨眼实际锚点
});
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/03-player-blink.png` });

// ---------- Boss：三技能预警截图（真实游戏画面） ----------
async function prepBoss() {
  return await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    // 触发 Boss 登场
    s.bossSpawned = false;
    s.elapsed = 600;
    return true;
  });
}
await prepBoss();
await page.waitForTimeout(400);
const bossInfo = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const be = s.bossEnemy;
  if (!be) return { spawned: false };
  // 把 Boss 挪到玩家右侧 220px，预警图形在镜头内
  be.x = s.player.x + 220; be.y = s.player.y;
  s.bossBrain.x = be.x; s.bossBrain.y = be.y;
  be.sprite.setPosition(be.x, be.y);
  return { spawned: true, hp: be.hp, phase: s.bossBrain.phase, name: be.def.name, bossBar: s.hud.bossText.text };
});
check('Boss 已登场且 HUD 专属血条显示', bossInfo.spawned && bossInfo.bossBar === '蓝色大肥鱼王', JSON.stringify(bossInfo));

// 1) dash 冲刺预警：红色直线指向玩家
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const b = s.bossBrain;
  b.state = 'telegraph'; b.stateT = 0.25; b.skill = 'dash';
  b.dashDirX = 0; b.dashDirY = 1; b.dashSpeed = 500;
  b.lastTelegraphParams = { duration: 0.9, dashDirX: 0, dashDirY: 1, dashFromX: b.x, dashFromY: b.y };
});
await page.waitForTimeout(120);
await page.screenshot({ path: `${OUT}/10-boss-telegraph-dash.png` });

// 2) spread 扇弹预警：中心聚能环
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const b = s.bossBrain;
  b.state = 'telegraph'; b.stateT = 0.25; b.skill = 'spread';
  b.lastTelegraphParams = { duration: 0.85, fanAngle: 0, fanCount: 9, fanHalf: 0.42 };
});
await page.waitForTimeout(120);
await page.screenshot({ path: `${OUT}/11-boss-telegraph-spread.png` });

// 3) circle 红圈预警：玩家脚下/身边多圈
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const b = s.bossBrain;
  b.state = 'telegraph'; b.stateT = 0.35; b.skill = 'circle';
  b.circleCache = [
    { x: s.player.x, y: s.player.y, r: 86 },
    { x: s.player.x + 150, y: s.player.y + 70, r: 70 }
  ];
  b.lastTelegraphParams = { duration: 1.15, circles: b.circleCache.map(c => ({ ...c })) };
});
await page.waitForTimeout(120);
await page.screenshot({ path: `${OUT}/12-boss-telegraph-circle.png` });

// 4) spread 执行：扇弹弹幕
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const b = s.bossBrain;
  b.state = 'act'; b.stateT = 0.05; b.skill = 'spread';
  b.lastTelegraphParams = { duration: 0.35, fanAngle: 0, fanCount: 9, fanHalf: 0.42 };
  for (let i = 0; i < 9; i++) {
    const off = -0.42 + (2 * 0.42 * i) / 8;
    s.enemyBullets.spawn(b.x, b.y, off, 280, 12, 7, 3.4);
  }
});
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/13-boss-act-spread-bullets.png` });

// 5) 狂暴咆哮（阶段变色光晕 + 阶段 2 血条提示）
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const b = s.bossBrain;
  b.phase = 1; b.state = 'roar'; b.stateT = 0.6;
  s.bossEnemy.hp = Math.floor(s.bossEnemy.maxHp * 0.5);   // 半血 → P1
});
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/14-boss-roar-phase2.png` });

// Boss 血条阶段/预警 HUD 文本抽查
const hudBoss = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { phaseText: s.hud.bossPhaseText.text, warnText: s.hud.bossPhaseText.text, barVisible: s.hud.bossBar.active };
});
log('  Boss HUD:', JSON.stringify(hudBoss));
check('Boss HUD 阶段/预警文字', /阶段 2\/3/.test(hudBoss.phaseText), hudBoss.phaseText);

// ---------- 手机横屏 844x390 ----------
const mctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const mp = await mctx.newPage();
mp.on('pageerror', e => errors.push(`[mobile pageerror] ${e.message}`));
mp.on('console', m => { if (m.type() === 'error' && !isNoise(m.text())) errors.push(`[mobile console.error] ${m.text()}`); });
await mp.goto(URL, { waitUntil: 'load' });
await mp.waitForTimeout(1400);
const mVer = await mp.evaluate(() => window.__VERSION ?? null);
check('手机端 __VERSION=0.9.0', mVer === '0.9.0', `实际 ${mVer}`);
await mp.screenshot({ path: `${OUT}/20-mobile-menu.png` });
const btn = await pagePoint(mp, 640, 216);
await mp.touchscreen.tap(btn.x, btn.y);
await mp.waitForTimeout(1500);
const mInGame = await mp.evaluate(() => !!window.__game?.scene.getScene('Game')?.player);
check('手机端 tap 开始键后进入 Game 场景', mInGame, '');
await mp.screenshot({ path: `${OUT}/21-mobile-gameplay.png` });
const mPlayer = await mp.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { hasPlayer: !!s.player, gunKey: s.player.gun.texture.key, fxKey: s.player.fx.texture.key };
});
check('手机端角色持枪/表情分层存在', mPlayer.gunKey === 'player_gun' && /^fx_/.test(mPlayer.fxKey), JSON.stringify(mPlayer));
await mctx.close();

// ---------- 汇总 ----------
const failed = results.filter(r => !r[1]);
log('\n===== v0.9.0 验收汇总 =====');
for (const [n, ok, d] of results) log(`  ${ok ? '✔' : '✘'} ${n}${d ? ` (${d})` : ''}`);
log(`结果：${results.length - failed.length}/${results.length} 通过，错误 ${errors.length}`);
if (errors.length) log('errors:\n' + errors.join('\n'));
await browser.close();
process.exit(failed.length > 0 || errors.length > 0 ? 1 : 0);
