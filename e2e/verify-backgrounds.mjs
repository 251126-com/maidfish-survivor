// v0.8.0 四背景选关 + 60s 轮换端到端验收（桌面 + 手机横屏）
// 验证：主菜单四张授权背景缩略卡可点选（选关）、首屏立即显示所选大背景；
//       局内按 0/60/120/180s 自动轮换且四张全部可实际进入；
//       HUD「场景」按钮手动切下一张；悬浮面板「场景切换」入口暂停态换景；
//       __BG_MARK/__BG_STATE 部署标记、cover 铺满、暗色遮罩、升级面板不回归、无控制台错误。
// 用法：CHROME_PATH=/usr/bin/chromium E2E_URL=http://127.0.0.1:4173/ node e2e/verify-backgrounds.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.E2E_URL || 'http://127.0.0.1:4173/';
const OUT = 'e2e/shots';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const isNoise = (t) => /favicon|404 \(Not Found\)/.test(t);
const results = [];
const check = (name, ok, detail = '') => { results.push([name, !!ok, detail]); console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  [' + detail + ']' : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

const expectBg = ['bg_moon', 'bg_trench', 'bg_ship', 'bg_vortex'];
// v0.8.0：60s 一格，开局 3 分钟触达全部四张（此前 0/180/300/480 太晚）
const expectSwitch = [0, 60, 120, 180];

// 读取局部状态的小工具：Game 场景 or Menu 场景
const gm = (page, code) => page.evaluate((c) => {
  const s = window.__game.scene.getScene('Game');
  return c(s);
}, code);

// ---------- 桌面 1280x720 ----------
console.log('\n===== 桌面 1280x720 =====');
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !isNoise(m.text())) errors.push(`[console.error] ${m.text()}`); });

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1600);

const ver = await page.evaluate(() => window.__VERSION ?? null);
check('版本标记 __VERSION=0.8.0', ver === '0.8.0', `实际 ${ver}`);
const mark = await page.evaluate(() => window.__BG_MARK ?? null);
check('背景标记 __BG_MARK 版本/数量/键', !!mark && mark.version === '0.8.0' && mark.count === 4 && JSON.stringify(mark.keys) === JSON.stringify(expectBg),
  `实际 ${JSON.stringify(mark)}`);

// 主菜单：四卡选关 + 首屏大背景
const menuHook = await page.evaluate(() => {
  const h = window.__MENU_BG;
  const s = window.__game.scene.getScene('Menu');
  return h ? { count: h.count, pick: h.get(), cards: s.bgCards.length, labels: s.bgLabels.map(l => l.text), imgKey: s.bgImage.texture.key, hint: s.bgNameText?.text ?? '' } : null;
});
check('主菜单四张缩略卡可选(选关器存在)', !!menuHook && menuHook.count === 4 && menuHook.cards === 4, JSON.stringify(menuHook));
check('主菜单首屏即显示一张大背景', !!menuHook && menuHook.imgKey !== '' && expectBg.includes(menuHook.imgKey), `img=${menuHook?.imgKey}`);
await page.screenshot({ path: `${OUT}/bg-menu-initial.png` });

// 点选第 4 张（深海旋涡）→ 底图实时切换
await page.evaluate(() => window.__MENU_BG.set(3));
await page.waitForTimeout(450);
const menuPicked = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Menu');
  return { pick: window.__MENU_BG.get(), imgKey: s.bgImage.texture.key, hint: s.bgNameText?.text ?? '' };
});
check('点选第4张缩略卡 → 首屏底图切为 bg_vortex', menuPicked.pick === 3 && menuPicked.imgKey === 'bg_vortex' && /深海旋涡/.test(menuPicked.hint), JSON.stringify(menuPicked));
await page.screenshot({ path: `${OUT}/bg-menu-pick-vortex.png` });
// 回到第 1 张，保证游戏从 bg_moon 确定性开局（验收轮换/按钮不依赖随机）
await page.evaluate(() => window.__MENU_BG.set(0));
await page.waitForTimeout(400);

// 进入游戏（携带菜单选中的起始背景）
await page.mouse.click(640, 230);
await page.waitForTimeout(1800);

// 纹理加载：四张授权背景 key 存在、尺寸为处理后的 1920x1080
const texInfo = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return ['bg_moon', 'bg_trench', 'bg_ship', 'bg_vortex'].map(key => {
    const t = s.textures.get(key);
    const src = t.getSourceImage();
    return { key, exists: t.key !== '__MISSING', w: src?.width ?? 0, h: src?.height ?? 0 };
  });
});
for (const t of texInfo) check(`背景纹理 ${t.key} 已加载且为 1920x1080`, t.exists && t.w === 1920 && t.h === 1080, `${t.w}x${t.h}`);

// cover 铺满 + 遮罩 + scrollFactor 0 + __BG_STATE
const layerInfo = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const imgs = s.bgLayer.images;
  return {
    activeKey: s.bgLayer.activeKey,
    activeIndex: s.bgLayer.activeIndex,
    cover: imgs.map(i => ({ w: i.displayWidth, h: i.displayHeight, sfx: i.scrollFactorX, sfy: i.scrollFactorY, key: i.texture.key })),
    maskAlpha: s.bgLayer.mask.fillAlpha,
    state: window.__BG_STATE
  };
});
check('菜单选关生效：开局背景为 bg_moon', layerInfo.activeKey === 'bg_moon', `实际 ${layerInfo.activeKey}`);
check('__BG_STATE 与活动背景一致(v0.8.0)', layerInfo.state && layerInfo.state.version === '0.8.0' && layerInfo.state.activeKey === layerInfo.activeKey,
  JSON.stringify(layerInfo.state));
check('四张图 cover 铺满 1280x720 且不随相机滚动', layerInfo.cover.every(i => i.w >= 1280 && i.h >= 720 && i.sfx === 0 && i.sfy === 0),
  JSON.stringify(layerInfo.cover.map(i => `${i.key}:${i.w.toFixed(0)}x${i.h.toFixed(0)}`)));
check('统一暗色遮罩透明度合理(0.2~0.45)', layerInfo.maskAlpha >= 0.2 && layerInfo.maskAlpha <= 0.45, `alpha=${layerInfo.maskAlpha}`);

// HUD「场景」按钮存在且显示当前背景名
const hudBg = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const b = s.hud.bgText;
  return { label: b?.text ?? null, x: b?.x ?? -1, y: b?.y ?? -1 };
});
check('HUD「场景」按钮显示当前背景名', !!hudBg.label && /月宫遗迹/.test(hudBg.label), JSON.stringify(hudBg));

// 冻结刷怪保证背景特写干净
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.spawnTimer = 99999;
  s.bossSpawned = true;
  s.player.invuln = 0;
  s.player.stats.hp = 9999;
});

// 时间轴切换：0/60/120/180 四张全部触达（v0.8.0 每 60s 一格）
const shots = [];
for (const sec of expectSwitch) {
  await page.evaluate((t) => { const s = window.__game.scene.getScene('Game'); s.elapsed = t; }, sec);
  await page.waitForTimeout(1400);   // 等交叉淡入完成
  const info = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    return { key: s.bgLayer.activeKey, idx: s.bgLayer.activeIndex, state: window.__BG_STATE.activeKey };
  });
  const expectKey = expectBg[expectSwitch.indexOf(sec)];
  check(`t=${sec}s 自动轮换为 ${expectKey}`, info.key === expectKey && info.state === expectKey, `实际 ${info.key}(idx=${info.idx}) state=${info.state}`);
  const name = `bg-auto-${info.key}-t${sec}.png`;
  await page.screenshot({ path: `${OUT}/${name}` });
  shots.push(name);
}
check('四张背景自动轮换截图均已生成', shots.length === 4, shots.join(','));

// 手动切景：HUD「场景」按钮 → 下一张 + HUD 标签 + __BG_STATE 同步
await page.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.elapsed = 0; });
await page.waitForTimeout(450);
await page.mouse.click(1218, 86);                       // HUD 场景按钮
await page.waitForTimeout(1200);
const afterBgClick = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { key: s.bgLayer.activeKey, label: s.hud.bgText.text, state: window.__BG_STATE.activeKey };
});
check('HUD 场景按钮手动切景 → bg_trench', afterBgClick.key === 'bg_trench' && afterBgClick.state === 'bg_trench', JSON.stringify(afterBgClick));
check('HUD 场景按钮标签已更新为荧光海沟', /荧光海沟/.test(afterBgClick.label), afterBgClick.label);
await page.screenshot({ path: `${OUT}/bg-hud-scene-btn.png` });

// 悬浮面板「场景切换」入口：暂停态换景（面板保持打开）
await page.mouse.click(1202, 638);                        // 点悬浮球开面板
await page.waitForTimeout(350);
const fmOpen = await page.evaluate(() => window.__game.scene.getScene('Game').floatMenu.isOpen);
check('悬浮面板已打开(暂停)', fmOpen === true, `open=${fmOpen}`);
const bgItem = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const it = s.floatMenu.layout.items.find(i => i.id === 'bg');
  return it ? { x: it.cx, y: it.cy } : null;
});
check('悬浮面板含「场景切换」按钮', !!bgItem, JSON.stringify(bgItem));
if (bgItem) {
  await page.mouse.click(bgItem.x, bgItem.y);
  await page.waitForTimeout(1300);
  const fmBg = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    return { key: s.bgLayer.activeKey, label: s.hud.bgText.text, stillOpen: s.floatMenu.isOpen };
  });
  check('悬浮面板场景切换 → bg_ship 且面板保持打开', fmBg.key === 'bg_ship' && fmBg.stillOpen, JSON.stringify(fmBg));
  await page.screenshot({ path: `${OUT}/bg-float-panel-scene.png` });
  // 关闭面板并恢复
  const resumeItem = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    const it = s.floatMenu.layout.items.find(i => i.id === 'resume');
    return it ? { x: it.cx, y: it.cy } : null;
  });
  if (resumeItem) { await page.mouse.click(resumeItem.x, resumeItem.y); await page.waitForTimeout(400); }
}
const fmClosed = await page.evaluate(() => !window.__game.scene.getScene('Game').floatMenu.isOpen && window.__game.scene.getScene('Game').paused === false);
check('关闭悬浮面板后游戏恢复运行', fmClosed === true, `closed+running=${fmClosed}`);

// HUD 元素与悬浮球都在画布内
const hudInfo = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const h = s.hud;
  const names = ['timeText', 'infoText', 'hpText', 'xpText', 'weaponText', 'bossText', 'soundText', 'vibText', 'pauseText', 'bgText'];
  const texts = names.filter(n => h[n]).map(n => ({ name: n, text: h[n].text, x: h[n].x, y: h[n].y, inCanvas: h[n].x >= 0 && h[n].x <= 1280 && h[n].y >= 0 && h[n].y <= 720 }));
  const ball = s.floatMenu.ball;
  return {
    texts,
    ball: ball ? { x: ball.x, y: ball.y, visible: ball.visible, inCanvas: ball.x >= 0 && ball.x <= 1280 && ball.y >= 0 && ball.y <= 720 } : null
  };
});
check('HUD 文本全部在画布内', hudInfo.texts.length > 0 && hudInfo.texts.every(t => t.inCanvas), `${hudInfo.texts.length} 个文本`);
check('悬浮球可见且在画布内', !!hudInfo.ball && hudInfo.ball.visible && hudInfo.ball.inCanvas, JSON.stringify(hudInfo.ball));
await page.screenshot({ path: `${OUT}/bg-hud-desktop.png` });

// 升级面板回归：真实渲染 + 截图（手机横屏段也做）
const panelInfo = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const opts = [
    { kind: 'new_weapon', id: 'sniper', name: '大肥鱼狙击枪', desc: '高伤慢速，贯穿一排并附带小型爆炸，对密集敌群造成范围伤害' },
    { kind: 'passive', id: 'scope', name: '女仆头饰瞄准镜', desc: '伤害 +8% 且经验 +10%，同时扩大拾取范围' },
    { kind: 'weapon_level', id: 'rifle', name: '步枪 Lv.2', desc: '射速小幅提升，输出更稳' }
  ];
  s.panel.show(opts, () => {});
  return { visible: s.panel.visible };
});
await page.waitForTimeout(1200);
check('升级面板可打开(不回归)', panelInfo.visible === true);
await page.screenshot({ path: `${OUT}/bg-levelup-desktop.png` });

// 轮询等待面板 tween 收敛（严格于后续 0.05 阈值）
async function waitPanelSettled(page, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const info = await page.evaluate(() => {
      const s = window.__game.scene.getScene('Game');
      return s.panel.cards.map((c, i) => {
        const L = s.panel.layout.cards[i];
        return { i, cy: c.bg.y, kindY: c.kind.y, nameY: c.name.y, descY: c.desc.y,
                 dk: Math.abs(c.kind.y - L.zone.kindY), dn: Math.abs(c.name.y - L.zone.nameY),
                 dd: Math.abs(c.desc.y - L.zone.descY), dc: Math.abs(c.bg.y - L.cy) };
      });
    });
    const settled = info.length === 3 && info.every(x => x.dk < 0.0005 && x.dn < 0.0005 && x.dd < 0.0005 && x.dc < 0.0005);
    if (settled) return { ok: true, info };
    if (Date.now() > deadline) return { ok: false, info };
    await page.waitForTimeout(200);
  }
}

// ---------- 手机横屏 844x390 ----------
console.log('\n===== 手机横屏 844x390 (isMobile + touch) =====');
const mctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const mpage = await mctx.newPage();
const mclient = await mctx.newCDPSession(mpage);
mpage.on('pageerror', e => errors.push(`[pageerror-mobile] ${e.message}`));
mpage.on('console', m => { if (m.type() === 'error' && !isNoise(m.text())) errors.push(`[console.error-mobile] ${m.text()}`); });

await mpage.goto(URL, { waitUntil: 'load' });
await mpage.waitForTimeout(1600);

const mVer = await mpage.evaluate(() => window.__VERSION ?? null);
check('手机端版本标记 0.8.0', mVer === '0.8.0', `实际 ${mVer}`);

// FIT 适配：画布必须完整落在 844x390 视口内
const box = await mpage.locator('canvas').first().boundingBox();
check('手机横屏 FIT：画布完整落在视口内', !!box && box.width <= 844 + 1 && box.height <= 390 + 1, `canvas ${box?.width.toFixed(0)}x${box?.height.toFixed(0)}`);

const mmap = async (lx, ly) => ({ x: box.x + (lx / 1280) * box.width, y: box.y + (ly / 720) * box.height });
const mtap = async (lx, ly) => {
  const p = await mmap(lx, ly);
  await mclient.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }] });
  await mpage.waitForTimeout(40);
  await mclient.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mpage.waitForTimeout(150);
};

// 点选起始背景为 0 → 确定性开局（不依赖随机）
await mpage.evaluate(() => window.__MENU_BG.set(0));
await mpage.waitForTimeout(300);
const mMenuPick = await mpage.evaluate(() => window.__MENU_BG.get());
check('手机端选关器可选中起始背景', mMenuPick === 0, `pick=${mMenuPick}`);
await mpage.screenshot({ path: `${OUT}/bg-mobile-menu-picker.png` });

// 进入游戏
await mtap(640, 230);
await mpage.waitForTimeout(1800);

// 触控拖动移动一小段，确认背景固定屏幕层不干扰操作
await (async () => {
  const a = await mmap(300, 300);
  const b = await mmap(600, 260);
  await mclient.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y, id: 1, radiusX: 3, radiusY: 3, force: 1 }] });
  await mpage.waitForTimeout(60);
  await mclient.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x, y: b.y, id: 1, radiusX: 3, radiusY: 3, force: 1 }] });
  await mpage.waitForTimeout(200);
  await mclient.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
})();
await mpage.waitForTimeout(400);

// 手机横屏：t=65s 自动轮换到荧光海沟（60s 一格）
await mpage.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.elapsed = 65; });
await mpage.waitForTimeout(1500);
const mBg = await mpage.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { key: s.bgLayer.activeKey, ballVisible: s.floatMenu.ball.visible, hp: s.player.stats.hp };
});
check('手机端 t=65s 自动轮换为 bg_trench', mBg.key === 'bg_trench', JSON.stringify(mBg));
await mpage.screenshot({ path: `${OUT}/bg-mobile-landscape-gameplay.png` });

// 手机横屏 HUD「场景」按钮：触摸切到下一张
await mtap(1218, 86);
await mpage.waitForTimeout(1200);
const mHudBg = await mpage.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { key: s.bgLayer.activeKey, label: s.hud.bgText.text };
});
check('手机端 HUD 场景按钮触摸切景 → bg_ship', mHudBg.key === 'bg_ship', JSON.stringify(mHudBg));
await mpage.screenshot({ path: `${OUT}/bg-mobile-hud-scene-btn.png` });

// 手机悬浮面板「场景切换」入口
await mtap(1202, 638);
await mpage.waitForTimeout(350);
const mBgItem = await mpage.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const it = s.floatMenu.layout.items.find(i => i.id === 'bg');
  return it ? { x: it.cx, y: it.cy } : null;
});
check('手机端悬浮面板含场景切换按钮', !!mBgItem, JSON.stringify(mBgItem));
if (mBgItem) {
  await mtap(mBgItem.x, mBgItem.y);
  await mpage.waitForTimeout(1300);
  const mFmBg = await mpage.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    return { key: s.bgLayer.activeKey, stillOpen: s.floatMenu.isOpen };
  });
  check('手机端悬浮面板场景切换 → bg_vortex', mFmBg.key === 'bg_vortex', JSON.stringify(mFmBg));
  // 关闭面板
  const mResume = await mpage.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    const it = s.floatMenu.layout.items.find(i => i.id === 'resume');
    return it ? { x: it.cx, y: it.cy } : null;
  });
  if (mResume) await mtap(mResume.x, mResume.y);
  await mpage.waitForTimeout(400);
}
await mpage.screenshot({ path: `${OUT}/bg-mobile-float-panel-scene.png` });

// 手机横屏升级面板布局（不叠印回归）
await mpage.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.panel.show([
    { kind: 'evolution', id: 'railgun', name: '大肥鱼磁暴轨道歼星炮改三型', desc: '进化：穿透一切，射速拉满，并获得额外的暴击率加成与更远的射程，再加一层鲸鱼护盾叠满更持久' },
    { kind: 'weapon_level', id: 'sniper', name: '大肥鱼狙击枪 Lv.5 终级形态完全解放', desc: '高伤慢速，贯穿一排并附带小型爆炸，对密集敌群造成范围伤害' },
    { kind: 'passive', id: 'scope', name: '女仆头饰瞄准镜终极进化再进化', desc: '伤害 +8% 且经验 +10%，同时扩大拾取范围，每级再额外叠加 2% 的暴击与 1% 移速，越叠越强' }
  ], () => {});
});
const settledPanel = await waitPanelSettled(mpage);
await mpage.screenshot({ path: `${OUT}/bg-levelup-mobile-landscape.png` });
const mPanel = await mpage.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return s.panel.cards.map((c, i) => {
    const L = s.panel.layout.cards[i];
    return { i, cy: c.bg.y, expectCy: L.cy, kindY: c.kind.y, nameY: c.name.y, descY: c.desc.y,
             kindOk: Math.abs(c.kind.y - L.zone.kindY) < 0.05, nameOk: Math.abs(c.name.y - L.zone.nameY) < 0.05, descOk: Math.abs(c.desc.y - L.zone.descY) < 0.05 };
  });
});
const panelAllOk = mPanel.length === 3 && mPanel.every(c => c.kindOk && c.nameOk && c.descOk);
check('手机横屏升级面板文本分区稳定(不叠印回归)', panelAllOk && settledPanel.ok, JSON.stringify({ settled: settledPanel.ok, panel: mPanel.map(c => ({ i: c.i, k: c.kindOk, n: c.nameOk, d: c.descOk })) }));

await mctx.close();
await page.close();
await browser.close();

// ---------- 汇总 ----------
console.log('\n===== 汇总 =====');
const failed = results.filter(r => !r[1]);
check(`控制台/页面错误为 0`, errors.length === 0, errors.slice(0, 5).join(' | '));
for (const [n, ok, d] of results) console.log(`${ok ? '✔' : '✘'} ${n}${d !== '' ? '  [' + d + ']' : ''}`);
console.log(`\n===== v0.8.0 背景验收：${results.length - failed.length}/${results.length} 通过，错误 ${errors.length} =====`);
if (failed.length > 0 || errors.length > 0) process.exit(1);
console.log('截图目录:', OUT);
process.exit(0);
