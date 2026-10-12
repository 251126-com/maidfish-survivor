// v0.4.0 专项端到端验证：实际角色素材、XP 数字、武器状态、暂停/恢复、震动开关、
// 程序化动作（移动 bob / 受击挤压 / 开火后坐）确定性检查；手机端补暂停与素材抽查。
// 用法：CHROME_PATH=/usr/bin/chromium E2E_URL=http://127.0.0.1:4173/ node e2e/verify-v030.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.E2E_URL || 'http://127.0.0.1:4173/';
const OUT = 'e2e/shots';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const isNoise = (t) => /favicon|404 \(Not Found\)/.test(t);
const log = (...a) => console.log(...a);
const results = [];
const check = (name, ok, detail = '') => { results.push([name, !!ok, detail]); };

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

// ---------- 桌面 1280x720 ----------
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !isNoise(m.text())) errors.push(`[console.error] ${m.text()}`); });

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1600);

const ver = await page.evaluate(() => window.__VERSION ?? null);
check('版本标记 __VERSION=0.5.0', ver === '0.5.0', `实际 ${ver}`);
log('  版本:', ver);

await page.mouse.click(640, 230);           // 开始游戏
await page.waitForTimeout(1800);

// 实际角色素材：必须是 preload 加载的 PNG（非程序化生成纹理）
const asset = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const img = s.player.sprite;
  const src = img.texture.getSourceImage();
  return {
    key: img.texture.key,
    texW: img.texture.source[0]?.width ?? 0,
    texH: img.texture.source[0]?.height ?? 0,
    naturalW: src.naturalWidth ?? 0,
    naturalH: src.naturalHeight ?? 0,
    frameH: img.height,
    scale: img.scaleX
  };
});
log('  角色素材:', JSON.stringify(asset));
check('角色使用 player_whale PNG 贴图', asset.key === 'player_whale' && asset.texW === 308 && asset.texH === 320,
  `key=${asset.key} ${asset.texW}x${asset.texH}`);

// XP 数字 / 武器状态
const hud = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { xp: s.hud.xpText.text, weapon: s.hud.weaponText.text };
});
log('  HUD:', JSON.stringify(hud));
check('XP 数字显示（经验 x/y）', /^经验 \d+ \/ \d+$/.test(hud.xp), hud.xp);
check('武器状态显示', /制式步枪 Lv\.1/.test(hud.weapon), hud.weapon);

// 移动 bob：按住拖动时 sprite.y 相对 player.y 产生正弦浮动
await page.mouse.move(640, 420);
await page.mouse.down();
await page.mouse.move(900, 420, { steps: 6 });   // 真正拖到满速（与 verify-joystick 同款）
const bobSamples = [];
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(40);
  bobSamples.push(await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    return s.player.sprite.y - s.player.y;   // bob 偏移
  }));
}
await page.mouse.up();
const bobRange = Math.max(...bobSamples) - Math.min(...bobSamples);
log(`  bob 偏移样本: [${bobSamples.join(',')}] range=${bobRange.toFixed(2)}`);
check('移动 bob 生效（偏移幅度>1px）', bobRange > 1, `range=${bobRange.toFixed(2)}px`);

// 朝向翻转：向右拖之后 facing=1；向左拖之后 facing=-1 且 flipX
const flip = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const before = { facing: s.player['facing'], flipX: s.player.sprite.flipX };
  // 直接给方向向量模拟向左移动一帧
  s.player.update(0.05, -1, 0);
  const after = { facing: s.player['facing'], flipX: s.player.sprite.flipX };
  return { before, after };
});
log('  朝向翻转:', JSON.stringify(flip));
check('向左移动触发 flipX 翻转', flip.before.facing === 1 && flip.after.facing === -1 && flip.after.flipX === true);

// 受击挤压：takeDamage 后 scaleX > scaleY（横向拉宽、纵向压扁）
const squash = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.player['hitKnockX'] = 0; s.player['hitKnockY'] = 0;   // 清后仰残值，只量挤压
  s.player.takeDamage(1);
  s.player.update(0.001, 0, 0);   // 推进一帧：挤压(scale)才反映到 sprite
  const sc = { x: s.player.sprite.scaleX, y: s.player.sprite.scaleY };
  s.player.stats.hp = 9999;   // 恢复，避免挂掉
  s.player.invuln = 0;
  return sc;
});
log('  受击挤压:', JSON.stringify(squash));
check('受击挤压生效（scaleX>scaleY）', squash.x > squash.y, `${squash.x.toFixed(3)} vs ${squash.y.toFixed(3)}`);

// 开火后坐：onFire() 后 sprite.x 相对 player.x 有反向偏移
const recoil = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.player['hitKnockX'] = 0; s.player['hitKnockY'] = 0;   // 清受击后仰残值，只量后坐
  s.player.update(0.001, 0, 0);           // 推进一帧，先让位移归零
  s.player.recoilX = 0;
  s.player.onFire();
  s.player.update(0.001, 0, 0);           // 推进一帧让后坐反映到 sprite 位置
  return s.player.sprite.x - s.player.x;   // 后坐偏移量（facing=1 时为 -4）
});
log('  开火后坐偏移:', recoil);
check('开火后坐生效（反方向位移≈-4）', Math.abs(recoil + 4) < 0.01, `offset=${recoil}`);

// 暂停/恢复：点暂停按钮 → elapsed 冻结；再点 → 继续
const pauseBtn = await page.evaluate(() => window.__game.scene.getScene('Game').hud['pauseBtn'] ? null : null); // 用屏幕坐标点击
await page.mouse.click(1218, 126);        // 暂停按钮
await page.waitForTimeout(200);
const p1 = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { paused: s.paused, elapsed: s.elapsed, label: s.hud['lastPauseLabel'], overlayVisible: s.pauseOverlay?.visible };
});
await page.waitForTimeout(1000);
const p2 = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { paused: s.paused, elapsed: s.elapsed };
});
log('  暂停:', JSON.stringify({ p1, p2 }));
check('暂停生效且计时冻结', p1.paused === true && Math.abs(p2.elapsed - p1.elapsed) < 0.01,
  `elapsed ${p1.elapsed.toFixed(3)} → ${p2.elapsed.toFixed(3)}`);
check('暂停遮罩可见 + 按钮文案切换', p1.overlayVisible === true && /继续/.test(p1.label), `${p1.label}`);
await page.mouse.click(1218, 126);        // 恢复
await page.waitForTimeout(400);
const p3 = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { paused: s.paused, overlayVisible: s.pauseOverlay?.visible, elapsed: s.elapsed };
});
log('  恢复:', JSON.stringify(p3));
check('恢复后计时继续', p3.paused === false && p3.overlayVisible === false && p3.elapsed > p2.elapsed + 0.2,
  `elapsed ${p2.elapsed.toFixed(3)} → ${p3.elapsed.toFixed(3)}`);

// 震动开关：点击后 vibrateEnabled 翻转，标签更新
const vibBefore = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { enabled: s.hud['vibText'] ? true : true, label: s.hud.vibText.text };
});
log('  震动开关初始:', JSON.stringify(vibBefore));
await page.mouse.click(1218, 206);        // 震动按钮
await page.waitForTimeout(200);
const vibAfter = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const el = document.createElement('div');
  return { label: s.hud.vibText.text, persisted: localStorage.getItem('maidfish-survivor-vib-v1') };
});
log('  震动开关点击后:', JSON.stringify(vibAfter));
check('震动开关可切换并持久化', vibBefore.label !== vibAfter.label && (vibAfter.persisted === 'off' || vibAfter.persisted === 'on'),
  `${vibBefore.label} → ${vibAfter.label}, storage=${vibAfter.persisted}`);
await page.mouse.click(1218, 206);        // 切回开启

// 无运行错误
await page.waitForTimeout(800);
check('无页面/控制台错误', errors.length === 0, errors.join('; ').slice(0, 300));

// 验收截图：全屏游戏画面（含角色 + 新 HUD）
await page.screenshot({ path: `${OUT}/40-gameplay-v030.png` });
log('  截图: e2e/shots/40-gameplay-v030.png');

// ---------- 手机 390x844 ----------
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const mp = await ctx.newPage();
mp.on('pageerror', e => errors.push(`[mobile pageerror] ${e.message}`));
await mp.goto(URL, { waitUntil: 'load' });
await mp.waitForTimeout(1600);
const mVer = await mp.evaluate(() => window.__VERSION ?? null);
check('手机端版本标记 0.5.0', mVer === '0.5.0', `实际 ${mVer}`);
// 手机点击开始（FIT 缩放映射）
const map = async (lx, ly) => {
  const box = await mp.locator('canvas').first().boundingBox();
  return { x: box.x + (lx / 1280) * box.width, y: box.y + (ly / 720) * box.height };
};
let pt = await map(640, 230);
await mp.touchscreen.tap(pt.x, pt.y);
await mp.waitForTimeout(2000);
const mAsset = await mp.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { key: s.player.sprite.texture.key, texW: s.player.sprite.texture.source[0]?.width ?? 0 };
});
check('手机端使用 player_whale 实际素材', mAsset.key === 'player_whale' && mAsset.texW === 308, JSON.stringify(mAsset));
// 手机端暂停抽查（右上角暂停按钮）
pt = await map(1218, 126);
await mp.touchscreen.tap(pt.x, pt.y);
await mp.waitForTimeout(300);
const mPause = await mp.evaluate(() => window.__game.scene.getScene('Game').paused);
check('手机端暂停可用', mPause === true, `paused=${mPause}`);
await mp.screenshot({ path: `${OUT}/41-mobile-pause-v030.png` });
await mp.touchscreen.tap(pt.x, pt.y);   // 恢复
await mp.waitForTimeout(300);

// ---------- 汇总 ----------
console.log('\n===== v0.4.0 专项验证 =====');
let fail = 0;
for (const [name, ok, detail] of results) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) fail++;
}
console.log(`\n结果: ${results.length - fail}/${results.length} 通过${fail ? `，${fail} 项失败` : ''}`);
process.exit(fail ? 1 : 0);
