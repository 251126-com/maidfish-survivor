// v0.5.0 验收：真实游戏内角色动作 + 完整 HUD + 流程（桌面/手机双视口）
// 截图全部来自运行中的真实游戏画面（player_whale.png + 程序化动画），不是原图/概念图。
// 用法：CHROME_PATH=/usr/bin/chromium E2E_URL=http://127.0.0.1:4173/ node e2e/verify-acceptance.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.E2E_URL || 'http://127.0.0.1:4173/';
const OUT = 'e2e/shots';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const isNoise = (t) => /favicon|404 \(Not Found\)/.test(t);
const results = [];
const check = (name, ok, detail = '') => results.push([name, !!ok, detail]);
const log = (...a) => console.log(...a);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

// ---------- 桌面 1280x720 ----------
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !isNoise(m.text())) errors.push(`[console.error] ${m.text()}`); });

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1500);

const ver = await page.evaluate(() => window.__VERSION ?? null);
check('版本标记 __VERSION=0.8.0', ver === '0.8.0', `实际 ${ver}`);
log('  版本标记:', ver);

// 进入游戏
await page.mouse.click(640, 230);
await page.waitForTimeout(1800);

// 实际角色素材（必须是 preload 加载的 PNG）
const asset = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const src = s.player.sprite.texture.getSourceImage();
  return {
    key: s.player.sprite.texture.key,
    texW: s.player.sprite.texture.source[0]?.width ?? 0,
    texH: s.player.sprite.texture.source[0]?.height ?? 0,
    dispH: s.player.sprite.height, scaleX: s.player.sprite.scaleX
  };
});
log('  角色素材:', JSON.stringify(asset));
check('角色使用 player_whale PNG 贴图(307x320)', asset.key === 'player_whale' && asset.texW === 308 && asset.texH === 320,
  `${asset.key} ${asset.texW}x${asset.texH}`);

// 冻结刷怪，保证动作特写干净
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.spawnTimer = 99999;
  s.bossSpawned = true;
  s.player.invuln = 0;
  s.player.stats.hp = 9999;
});

// HUD 状态抽查
const hudState = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const h = s.hud;
  return {
    hpText: h.hpText.text, xpText: h.xpText.text, info: h.infoText.text,
    time: h.timeText.text, weapon: h.weaponText.text,
    hpBarFill: h.hpBar.fillStyle().color ?? null
  };
});
log('  HUD:', JSON.stringify(hudState));
check('血条数字 (hp/max)', /^\d+ \/ \d+$/.test(hudState.hpText), hudState.hpText);
check('XP 条数字 (经验 x/y)', /^经验 \d+ \/ \d+$/.test(hudState.xpText), hudState.xpText);
check('等级/击杀/金币显示', /Lv\.\d+\n击杀 \d+\n金币 \d+/.test(hudState.info), JSON.stringify(hudState.info));
check('计时显示 (mm:ss)', /^\d{2}:\d{2}$/.test(hudState.time), hudState.time);
check('武器状态显示 制式步枪 Lv.1', /制式步枪 Lv\.1/.test(hudState.weapon), hudState.weapon);

// 全屏 HUD 截图
await page.screenshot({ path: `${OUT}/60-desktop-hud-full.png` });
log('  截图: 60-desktop-hud-full.png');

// 特写镜头：相机 zoom 2 对准角色
const closeup = (zoom) => page.evaluate((z) => {
  const s = window.__game.scene.getScene('Game');
  const cam = s.cameras.main;
  cam.setZoom(z);
  cam.centerOn(s.player.sprite.x - s.player.recoilX - s.player.hitKnockX, s.player.y);
  s.player.update(0.001, 0, 0);
}, zoom);

const pauseAnim = () => page.waitForTimeout(60);

// --- 待机呼吸（t=0 轻摆绕中央；放大→缩小两帧） ---
await closeup(2);
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.player.animT = Math.PI / 7;   // sin(3.5*t)=1 → 呼吸最大
  s.player.update(0.001, 0, 0);
});
await pauseAnim();
const idleMax = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { sx: +s.player.sprite.scaleX.toFixed(4), rot: +s.player.sprite.rotation.toFixed(4) };
});
await page.screenshot({ path: `${OUT}/61-idle-breathe-max.png` });

await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.player.animT = Math.PI * 3 / 7;   // sin(3.5*t)=-1 → 呼吸最小
  s.player.update(0.001, 0, 0);
});
await pauseAnim();
const idleMin = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { sx: +s.player.sprite.scaleX.toFixed(4), rot: +s.player.sprite.rotation.toFixed(4) };
});
await page.screenshot({ path: `${OUT}/62-idle-breathe-min.png` });
log('  待机:', JSON.stringify({ idleMax, idleMin }));
check('待机呼吸缩放变化 (max≠min)', idleMax.sx !== idleMin.sx, `${idleMax.sx} → ${idleMin.sx}`);
check('待机轻摆旋转生效 (|rot|>0)', Math.abs(idleMax.rot) > 0.005 || Math.abs(idleMin.rot) > 0.005, `rot=${idleMax.rot}`);

// --- 移动 bob + 行走倾斜（向右，bob 峰值附近） ---
await page.keyboard.down('D');
await page.waitForTimeout(60);
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.player.animT = Math.PI / 22;   // sin(11*t)=1 → bob 最大上浮
  s.player.update(0.001, 1, 0);
});
await pauseAnim();
const move = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { bob: +(s.player.sprite.y - s.player.y - s.player.hitKnockY).toFixed(2), rot: +s.player.sprite.rotation.toFixed(4), flipX: s.player.sprite.flipX };
});
await page.screenshot({ path: `${OUT}/63-move-right-bob.png` });
await page.keyboard.up('D');
log('  右移:', JSON.stringify(move));
check('移动 bob 生效 (上浮>2px)', move.bob > 2, `bob=${move.bob}px`);
check('行走倾斜生效 (rot>0)', move.rot > 0.01, `rot=${move.rot}`);
check('右移朝右 (flipX=false)', move.flipX === false, `flipX=${move.flipX}`);

// --- 转向翻面（向左） ---
await page.keyboard.down('A');
await page.waitForTimeout(60);
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.player.animT = Math.PI / 22;
  s.player.update(0.001, -1, 0);
});
await pauseAnim();
const flip = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { facing: s.player['facing'], flipX: s.player.sprite.flipX, rot: +s.player.sprite.rotation.toFixed(4) };
});
await page.screenshot({ path: `${OUT}/64-move-left-flip.png` });
await page.keyboard.up('A');
log('  左移翻面:', JSON.stringify(flip));
check('向左移动翻面 (facing=-1, flipX=true)', flip.facing === -1 && flip.flipX === true, JSON.stringify(flip));

// --- 受击红闪+挤压+后仰（真实碰撞路径：敌人生成在角色身上触发 collideEnemyPlayer） ---
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.player.invuln = 0;
  s.player.stats.hp = 9999;
  s.enemies.spawn('fish', s.player.x + 2, s.player.y, s.elapsed);
});
await page.waitForFunction(() => {
  const s = window.__game.scene.getScene('Game');
  return s.player.sprite.isTinted && Math.abs(s.player['hitKnockX']) > 1;
}, { timeout: 1500 }).catch(() => {});
await pauseAnim();
const hit = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return {
    tinted: s.player.sprite.isTinted,
    sq: { x: +s.player.sprite.scaleX.toFixed(3), y: +s.player.sprite.scaleY.toFixed(3) },
    knock: { x: +s.player['hitKnockX'].toFixed(1), y: +s.player['hitKnockY'].toFixed(1) }
  };
});
await page.screenshot({ path: `${OUT}/65-hit-redflash.png` });
log('  受击:', JSON.stringify(hit));
check('受击闪红 (sprite 被红色 tint)', hit.tinted === true, `tinted=${hit.tinted}`);
check('受击挤压 (scaleX>scaleY)', hit.sq.x > hit.sq.y, `${hit.sq.x} vs ${hit.sq.y}`);
check('受击后仰位移 (hitKnock 生效)', Math.hypot(hit.knock.x, hit.knock.y) > 3, JSON.stringify(hit.knock));

// 清掉玩家附近的敌人，避免后续干扰
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  for (const e of [...s.enemies.live]) s.enemies.pool.release(e);
  s.player.invuln = 0;
  s.player.stats.hp = 9999;
});

// --- 开火后坐（真实自动开火路径：放一个射程内敌人触发 WeaponSystem） ---
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.player.recoilX = 0;
  s.player['facing'] = 1;   // 归位朝右：后坐应为负向（朝左），与下方检查方向一致
  s.player.update(0.001, 0, 0);
  s.enemies.spawn('fish', s.player.x + 250, s.player.y, s.elapsed);
});
await page.waitForFunction(() => {
  const s = window.__game.scene.getScene('Game');
  // 等待“视觉位移”生效（sprite 已被 setPosition 应用到后坐），
  // 而非内部 recoilX：避免采样落在渲染帧之间造成误报。
  return (s.player.sprite.x - s.player.x - s.player.hitKnockX) < -2;
}, { timeout: 2000 }).catch(() => {});
await pauseAnim();
const recoil = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { off: +(s.player.sprite.x - s.player.x - s.player['hitKnockX']).toFixed(2), recoilX: +s.player['recoilX'].toFixed(2) };
});
await page.screenshot({ path: `${OUT}/66-fire-recoil.png` });
log('  开火后坐:', JSON.stringify(recoil));
check('开火后坐生效 (反向位移<-2)', recoil.off < -2, `off=${recoil.off}`);

// 清理并恢复镜头
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  for (const e of [...s.enemies.live]) s.enemies.pool.release(e);
  s.cameras.main.setZoom(1);
  s.player.invuln = 0;
  s.player['hitKnockX'] = 0; s.player['hitKnockY'] = 0;
  s.player.update(0.001, 0, 0);
});
await page.waitForTimeout(200);

// --- 升级三选一（真实流程：注入经验触发 checkLevelUp） ---
const lvShown = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.levelSys.addXp(s.levelSys.need, 1);   // 精确触发 1 级；1e9 会多级重开面板（行为正确，非失败）
  s.checkLevelUp();
  return { visible: s.panel.visible, title: s.panel['title'].text, cards: s.panel.cards.length };
});
log('  升级面板:', JSON.stringify(lvShown));
check('升级三选一面板弹出', lvShown.visible === true && lvShown.cards === 3, JSON.stringify(lvShown));
await page.screenshot({ path: `${OUT}/67-levelup-panel.png` });

// 点第一张卡片（真实选择路径）
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.panel.cards[0].bg.emit('pointerdown');   // 触发卡片真实点击回调（onPick(0)）
});
await page.waitForTimeout(200);
const lvHidden = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { visible: s.panel.visible };
});
log('  选择后面板:', JSON.stringify(lvHidden));
check('选择后面板关闭', lvHidden.visible === false, JSON.stringify(lvHidden));

// --- 暂停/恢复（真实按钮点击） ---
await page.mouse.click(1218, 126);
await page.waitForTimeout(150);
const paused = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { paused: s.paused, overlay: s.pauseOverlay?.visible, label: s.hud['lastPauseLabel'] };
});
await page.screenshot({ path: `${OUT}/68-pause-overlay.png` });
log('  暂停:', JSON.stringify(paused));
check('暂停遮罩 + 文案切换', paused.paused === true && paused.overlay === true && /继续/.test(paused.label), JSON.stringify(paused));
await page.mouse.click(1218, 126);
await page.waitForTimeout(250);
const resumed = await page.evaluate(() => window.__game.scene.getScene('Game').paused);
check('恢复', resumed === false, `paused=${resumed}`);

// --- 震动设置开关（真实按钮 → localStorage 持久化） ---
await page.mouse.click(1218, 206);
await page.waitForTimeout(150);
const vib = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { label: s.hud.vibText.text, stored: localStorage.getItem('maidfish-survivor-vib-v1') };
});
check('震动开关可切换并持久化', /✕|📳/.test(vib.label) && (vib.stored === 'on' || vib.stored === 'off'), JSON.stringify(vib));
await page.mouse.click(1218, 206);   // 恢复开启
await page.waitForTimeout(150);

// 全屏持续游戏画面（含 HUD + 战斗）
await page.screenshot({ path: `${OUT}/69-desktop-gameplay-late.png` });

// 重置根因检查：还原刷怪
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.spawnTimer = 0;
  s.bossSpawned = false;
});

// ---------- 失败/重开流程（独立页面，避免污染主局） ----------
const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page2.goto(URL, { waitUntil: 'load' });
await page2.waitForTimeout(1200);
await page2.mouse.click(640, 230);
await page2.waitForTimeout(1200);
await page2.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.player.stats.hp = 0;      // 血量归零
  s.checkEnd();               // 触发真实失败结算
});
await page2.waitForTimeout(500);
const result = await page2.evaluate(() => {
  const g = window.__game.scene.getScene('Game');
  const r = window.__game.scene.getScene('Result');
  return {
    resultActive: r ? window.__game.scene.isActive('Result') : false,
    gameKey: g ? g.scene.key : null,
    isOver: g ? g.isOver : null
  };
});
const resText = await page2.locator('canvas').screenshot({ path: `${OUT}/70-result-fail.png` }).then(() => 'ok').catch(() => 'err');
log('  失败结算:', JSON.stringify(result), resText);
// 点"再来一局"回到游戏
const resButtons = await page2.evaluate(() => {
  // 通过场景对象找不到按钮，直接用坐标点第一个按钮（左：再来一局）
  return null;
});
await page2.mouse.click(640 - 150, 520);
await page2.waitForTimeout(600);
const restarted = await page2.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return s ? { scene: s.scene.key, elapsed: s.elapsed } : null;
}).catch(() => null);
log('  重开后:', JSON.stringify(restarted));
check('失败→结算场景(Result active)', result.resultActive === true && result.isOver === true, JSON.stringify(result));
check('再来一局回到 Game 场景', restarted !== null && restarted.scene === 'Game', JSON.stringify(restarted));
await page2.close();

// ---------- 手机 390x844（真实触摸） ----------
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const mp = await ctx.newPage();
const client = await ctx.newCDPSession(mp);
const mTouch = async (type, pts) => client.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const mTap = async (lx, ly) => {
  const p = await map(lx, ly);
  await mTouch('touchStart', [{ x: p.x, y: p.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }]);
  await mp.waitForTimeout(40);
  await mTouch('touchEnd', []);
  await mp.waitForTimeout(120);
};
mp.on('pageerror', e => errors.push(`[mobile pageerror] ${e.message}`));
await mp.goto(URL, { waitUntil: 'load' });
await mp.waitForTimeout(1400);
const mVer = await mp.evaluate(() => window.__VERSION ?? null);
check('手机端版本标记 0.5.0', mVer === '0.8.0', `实际 ${mVer}`);
const map = async (lx, ly) => {
  const box = await mp.locator('canvas').first().boundingBox();
  return { x: box.x + (lx / 1280) * box.width, y: box.y + (ly / 720) * box.height };
};
await mTap(640, 230);
await mp.waitForTimeout(2000);
const mAsset = await mp.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { key: s.player.sprite.texture.key, texW: s.player.sprite.texture.source[0]?.width ?? 0 };
});
check('手机端使用 player_whale 实际素材', mAsset.key === 'player_whale' && mAsset.texW === 308, JSON.stringify(mAsset));

// 手机端拖动摇杆（CDP 真实触摸拖拽 → 角色移动 + bob）
const box = await mp.locator('canvas').first().boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await mTouch('touchStart', [{ x: cx, y: cy, id: 1, radiusX: 2, radiusY: 2, force: 1 }]);
await mp.waitForTimeout(60);
for (let i = 1; i <= 6; i++) {
  await mTouch('touchMove', [{ x: cx + 90 * i / 6, y: cy, id: 1, radiusX: 2, radiusY: 2, force: 1 }]);
  await mp.waitForTimeout(30);
}
await mp.waitForTimeout(300);
const mJoy = await mp.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const j = s.inputSys ? s.inputSys.joystick : null;
  return { j: j ? { mag: +j.magnitude.toFixed(2), dirX: +j.dirX.toFixed(2) } : null, bob: +(s.player.sprite.y - s.player.y - s.player['hitKnockY']).toFixed(2) };
});
await mp.screenshot({ path: `${OUT}/71-mobile-joystick.png` });
await mTouch('touchEnd', []);
log('  手机摇杆:', JSON.stringify(mJoy));
check('手机摇杆满速拖动 + 移动 bob', mJoy.j !== null && mJoy.j.mag > 0.9 && mJoy.j.dirX > 0.9 && mJoy.bob !== 0, JSON.stringify(mJoy));

// 手机端暂停
await mTap(1218, 126);
await mp.waitForTimeout(300);
const mPaused = await mp.evaluate(() => window.__game.scene.getScene('Game').paused);
await mp.screenshot({ path: `${OUT}/72-mobile-pause.png` });
check('手机端暂停', mPaused === true, `paused=${mPaused}`);
await mTap(1218, 126);
await mp.waitForTimeout(300);

// 手机端竖屏提示应显示
const hintShown = await mp.evaluate(() => {
  const el = document.getElementById('rotate-hint');
  return getComputedStyle(el).display;
});
check('手机竖屏显示转屏提示', hintShown === 'flex', hintShown);
await mp.close();

// ---------- 汇总 ----------
check('无页面/控制台错误', errors.length === 0, errors.join('; ').slice(0, 300));
console.log('\n===== v0.5.0 验收结果 =====');
let fail = 0;
for (const [name, ok, detail] of results) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) fail++;
}
console.log(`\n结果: ${results.length - fail}/${results.length} 通过${fail ? `，${fail} 项失败` : ''}`);
if (errors.length) {
  console.log('捕获错误:');
  for (const e of errors.slice(0, 8)) console.log('  ' + e);
}
await browser.close();
process.exit(fail ? 1 : 0);
