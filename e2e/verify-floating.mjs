// v0.5.0 悬浮菜单端到端验收：透明可拖拽悬浮球 + 全屏面板
// 覆盖：默认位置/透明度、拖动改位置、刷新后位置持久化、点球开面板(暂停)、
//      继续/音效/震动/全屏/重开/返回菜单、升级面板打开时球不误触、桌面键盘不受影响、
//      手机触摸拖动+面板截图、手机摇杆不因球误启
// 用法：CHROME_PATH=/usr/bin/chromium E2E_URL=http://127.0.0.1:4173/ node e2e/verify-floating.mjs
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

// ---------- 桌面 1280x720 ----------
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !isNoise(m.text())) errors.push(`[console.error] ${m.text()}`); });
const box = async () => page.locator('canvas').first().boundingBox();
const l2p = async (lx, ly) => { const b = await box(); return { x: b.x + (lx / 1280) * b.width, y: b.y + (ly / 720) * b.height }; };
const click = async (lx, ly) => { const p = await l2p(lx, ly); await page.mouse.click(p.x, p.y); await page.waitForTimeout(150); };
const drag = async (lx0, ly0, lx1, ly1) => {
  const a = await l2p(lx0, ly0); const b2 = await l2p(lx1, ly1);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(a.x + (b2.x - a.x) * 0.5, a.y + (b2.y - a.y) * 0.5, { steps: 5 });
  await page.mouse.move(b2.x, b2.y, { steps: 5 });
  await page.mouse.up(); await page.waitForTimeout(200);
};
const gm = () => page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  if (!s || !s.scene.isActive()) return { activeScene: window.__game.scene.getScenes(true)[0]?.scene?.key ?? null };
  return {
    activeScene: 'Game', elapsed: Number(s.elapsed.toFixed(2)),
    paused: s.paused, floatOpen: s.floatMenu.isOpen,
    ball: s.floatMenu.ballPos, ballDepth: s.floatMenu.ball.depth,
    joy: s.inputSys.joystick ? 'active' : 'idle',
    levelPanel: s.panel.visible
  };
});
const panelState = () => page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const fm = s.floatMenu;
  return {
    open: fm.isOpen,
    overlay: fm.overlay.visible,
    items: fm.items.map(i => ({ id: i.id, v: i.rect.visible, text: i.text.text })),
    sfx: window.__sfx.enabled
  };
});
// 从运行时布局读取面板按钮坐标，避免硬编码与布局漂移
const itemPos = (id) => page.evaluate((iid) => {
  const s = window.__game.scene.getScene('Game');
  const it = s.floatMenu.layout.items.find(i => i.id === iid);
  return it ? { x: it.cx, y: it.cy } : null;
}, id);
const clickItem = async (id) => { const p = await itemPos(id); if (!p) throw new Error('missing item ' + id); await click(p.x, p.y); };

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1600);
const ver = await page.evaluate(() => window.__VERSION);
check('版本标记 __VERSION=0.8.0', ver === '0.8.0', `实际 ${ver}`);

await click(640, 230);            // 开始游戏
await page.waitForTimeout(1800);

// 1) 默认悬浮球位置 & 半透明
let st = await gm();
check('球默认在右下角 (1202,638)', st.ball && Math.abs(st.ball.x - 1202) <= 2 && Math.abs(st.ball.y - 638) <= 2, JSON.stringify(st.ball));
const alpha0 = await page.evaluate(() => { const b = window.__game.scene.getScene('Game').floatMenu.ball; return { obj: b.alpha, fill: b.fillAlpha }; });
check('悬浮球半透明(fillAlpha=0.62)', alpha0.fill < 1 && alpha0.fill > 0.3, `obj=${alpha0.obj} fill=${alpha0.fill}`);
await page.screenshot({ path: `${OUT}/80-desktop-float-ball.png` });

// 2) 核心操作不被挡：运行中时间在走（未误暂停）
const e1 = (await gm()).elapsed;
await page.waitForTimeout(1200);
const e2 = (await gm()).elapsed;
check('游戏在跑（未误暂停）', e2 > e1, `${e1} → ${e2}`);

// 3) 点按球 → 面板打开并暂停，且不误触摇杆
await click(1202, 638);
let ps = await panelState();
st = await gm();
check('点按球打开面板', ps.open && ps.overlay, JSON.stringify(ps));
check('面板含 7 个操作按钮(含场景切换)', ps.items.length === 7 && ps.items.every(i => i.v), ps.items.map(i => i.id).join(','));
check('面板含场景切换入口', ps.items.some(i => i.id === 'bg' && /场景/.test(i.text)), ps.items.find(i => i.id === 'bg')?.text);
check('面板含 Fullscreen 入口', ps.items.some(i => i.id === 'full' && /全屏/.test(i.text)), ps.items.find(i => i.id === 'full')?.text);
check('打开面板时无摇杆误触', st.joy === 'idle', st.joy);
check('打开面板即暂停(elapsed 冻结)', st.paused === true, `paused=${st.paused}`);
check('悬浮球深度低于升级遮罩(190<200)', st.ballDepth < 200, `depth=${st.ballDepth}`);
await page.screenshot({ path: `${OUT}/81-desktop-float-panel.png` });

// 4) 点面板外 → 关闭并恢复运行
await click(150, 660);
st = await gm();
const ps2 = await panelState();
check('点外部关闭面板', !ps2.open);
check('关闭后面板恢复运行', st.paused === false, `paused=${st.paused}`);

// 5) 拖动悬浮球 → 位置改变
await drag(1202, 638, 1010, 480);
st = await gm();
const dragged = st.ball;
check('拖动后球位置改变', Math.abs(dragged.x - 1010) <= 3 && Math.abs(dragged.y - 480) <= 3, JSON.stringify(dragged));
await page.screenshot({ path: `${OUT}/84-desktop-float-dragged.png` });

// 6) 刷新页面 → 位置持久化（localStorage）
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1400);
await click(640, 230);
await page.waitForTimeout(1200);
st = await gm();
check('刷新后球位置保持', Math.abs(st.ball.x - 1010) <= 3 && Math.abs(st.ball.y - 480) <= 3, JSON.stringify(st.ball));

// 7) 面板内：音效/震动/全屏开关
await click(1010, 480);                       // 再点球开面板
ps = await panelState();
check('面板再次打开', ps.open);
const sfx0 = ps.sfx;
await clickItem('sound');                    // 音效按钮（布局动态坐标）
const sfx1 = (await panelState()).sfx;
check('音效开关切换并持久化', sfx1 === !sfx0, `on=${sfx0} → ${sfx1}`);
check('音效按钮文案已刷新', (await panelState()).items.some(i => i.id === 'sound' && /音效：关/.test(i.text)));
await clickItem('vib');                      // 震动按钮（布局动态坐标）
const vibTxt = (await panelState()).items.find(i => i.id === 'vib')?.text ?? '';
check('震动按钮文案已刷新', /震动：关/.test(vibTxt), vibTxt);

// 全屏手势入口：点 ⛶ 全屏 → 请求进入全屏；再次点 → 退出
const fsBefore = await page.evaluate(() => !!(document.fullscreenElement || document.webkitFullscreenElement));
await clickItem('full');                     // full 按钮（布局动态坐标）
await page.waitForTimeout(400);
const fsEnter = await page.evaluate(() => !!(document.fullscreenElement || document.webkitFullscreenElement));
check('Fullscreen 手势入口：进入全屏', fsEnter === true && fsBefore === false, `before=${fsBefore} after=${fsEnter}`);
await page.waitForTimeout(200);
await clickItem('full');                     // 再点退出全屏
await page.waitForTimeout(400);
const fsExit = await page.evaluate(() => !!(document.fullscreenElement || document.webkitFullscreenElement));
check('Fullscreen 手势入口：退出全屏', fsExit === false, `after=${fsExit}`);

// 8) 继续按钮 → 关面板并恢复
await clickItem('resume');
st = await gm();
check('继续按钮恢复游戏', st.paused === false && !st.floatOpen, `paused=${st.paused}, open=${st.floatOpen}`);

// 8.5) 桌面键盘不受影响：P 暂停/继续、ESC 暂停/继续
await page.keyboard.press('KeyP'); await page.waitForTimeout(200);
st = await gm();
check('键盘 P 暂停不打开悬浮面板', st.paused === true && !st.floatOpen, `paused=${st.paused} open=${st.floatOpen}`);
await page.keyboard.press('KeyP'); await page.waitForTimeout(200);
st = await gm();
check('键盘 P 恢复游戏', st.paused === false, `paused=${st.paused}`);
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
st = await gm();
check('键盘 ESC 暂停', st.paused === true, `paused=${st.paused}`);
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
st = await gm();
check('键盘 ESC 恢复', st.paused === false, `paused=${st.paused}`);

// 9) 升级面板打开时悬浮球不误触：球在 190 层 < 升级遮罩 200 层，点球位不弹悬浮菜单
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.levelSys.addXp(s.levelSys.need, 1);
  s.checkLevelUp();
});
await page.waitForTimeout(600);
st = await gm();
check('升级面板已打开', st.levelPanel === true, `levelPanel=${st.levelPanel}`);
await click(1010, 480);                       // 点悬浮球当前位置
st = await gm();
check('升级面板打开时点球不误触悬浮菜单', st.floatOpen === false && st.paused === false, `open=${st.floatOpen} paused=${st.paused}`);
await page.screenshot({ path: `${OUT}/85-desktop-levelup-no-mistouch-ball.png` });
await click(640, 390);                        // 选中间卡片继续
await page.waitForTimeout(600);
st = await gm();
check('选卡后面板关闭且游戏恢复', st.levelPanel === false && st.floatOpen === false, `levelPanel=${st.levelPanel}`);
await page.screenshot({ path: `${OUT}/86-desktop-after-levelup-pick.png` });

// 10) 重开本局
await click(1010, 480);
await page.waitForTimeout(150);
await clickItem('restart');                  // 重开本局（布局动态坐标）
await page.waitForTimeout(900);
st = await gm();
check('重开本局 → 回到 Game 且时间清零', st.activeScene === 'Game' && st.elapsed < 3, `elapsed=${st.elapsed}`);

// 11) 返回主菜单
await page.waitForTimeout(600);
await click(1010, 480);
await page.waitForTimeout(200);
const psOpen = await panelState();
check('重开后面板可再次打开', psOpen.open);
await clickItem('menu');                     // 返回主菜单（布局动态坐标）
await page.waitForTimeout(700);
const scene = await page.evaluate(() => window.__game.scene.getScenes(true)[0]?.scene?.key);
check('返回主菜单 → Menu', scene === 'Menu', `scene=${scene}`);

// ---------- 手机 390x844 触摸 ----------
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const mp = await mctx.newPage();
const mcdp = await mctx.newCDPSession(mp);
mp.on('pageerror', e => errors.push(`[m-pageerror] ${e.message}`));
await mp.goto(URL, { waitUntil: 'load' });
await mp.waitForTimeout(1500);
const mmap = async (lx, ly) => { const b = await mp.locator('canvas').first().boundingBox(); return { x: b.x + (lx / 1280) * b.width, y: b.y + (ly / 720) * b.height }; };
const mtap = async (lx, ly) => { const p = await mmap(lx, ly); await mcdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }] }); await mp.waitForTimeout(50); await mcdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await mp.waitForTimeout(150); };
await mtap(640, 230);                       // 开始
await mp.waitForTimeout(1600);
const mball = await mp.evaluate(() => { const s = window.__game.scene.getScene('Game'); return s && s.floatMenu ? s.floatMenu.ballPos : null; });
check('手机端球可见(默认位置)', mball && Math.abs(mball.x - 1202) <= 3 && Math.abs(mball.y - 638) <= 3, JSON.stringify(mball));
await mp.screenshot({ path: `${OUT}/82-mobile-float-ball.png`, fullPage: false });
// 手机触摸拖动
const mb1 = await mmap(1202, 638); const mb2 = await mmap(900, 560);
await mcdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mb1.x, y: mb1.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }] });
for (let i = 1; i <= 6; i++) { await mcdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: mb1.x + (mb2.x - mb1.x) * i / 6, y: mb1.y + (mb2.y - mb1.y) * i / 6, id: 1, radiusX: 2, radiusY: 2, force: 1 }] }); await mp.waitForTimeout(40); }
await mcdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await mp.waitForTimeout(200);
const mball2 = await mp.evaluate(() => { const s = window.__game.scene.getScene('Game'); return s.floatMenu.ballPos; });
check('手机触摸拖动球', Math.abs(mball2.x - 900) <= 3 && Math.abs(mball2.y - 560) <= 3, JSON.stringify(mball2));
// 手机在球以外区域触摸 → 摇杆正常启动（球不遮挡摇杆）
const mb3 = await mmap(300, 400);
await mcdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mb3.x, y: mb3.y, id: 2, radiusX: 2, radiusY: 2, force: 1 }] });
await mp.waitForTimeout(80);
const mjoy = await mp.evaluate(() => { const s = window.__game.scene.getScene('Game'); const j = s.inputSys.joystick; return j ? { active: j.active, x: Math.round(j.baseX), y: Math.round(j.baseY) } : null; });
await mcdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
check('手机摇杆不被球遮挡(球外区域可启动摇杆)', mjoy && mjoy.active, JSON.stringify(mjoy));
// 手机点球开面板
await mtap(900, 560);
const mopen = await mp.evaluate(() => { const s = window.__game.scene.getScene('Game'); return s.floatMenu.isOpen && s.paused; });
check('手机点球 → 面板打开且暂停', mopen === true, `open+paused=${mopen}`);
await mp.screenshot({ path: `${OUT}/83-mobile-float-panel.png` });

// 汇总：无页面/控制台错误
check('无页面/控制台错误', errors.length === 0, errors.join('; ').slice(0, 300));

console.log('\n===== v0.5.0 悬浮菜单验收结果 =====');
const fail = results.filter(r => !r[1]);
for (const [name, , d] of results) console.log(`  ${name}`);
console.log(`pass ${results.length - fail.length}/${results.length}`);
if (errors.length) { console.log('errors:'); for (const e of errors) console.log('  ' + e.slice(0, 300)); }
await browser.close();
process.exit(fail.length === 0 ? 0 : 1);
