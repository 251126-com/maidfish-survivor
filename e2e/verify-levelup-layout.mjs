// v0.5.1 升级面板布局回归：真正的"文字叠印"验收
// 回归目标（v0.5.0 根因）：show() 用 `y: [a,b,c,d,e]` 数组 tween，
//    Phaser 视为单目标关键帧路径 → 全部对象被 tween 到数组最后一项，
//    文字在卡片中心叠印、卡片背景整体下移。
// 本脚本：触发升级面板 → 等 tween 完成 → 断言每个对象停在各自的基准 y、
//    kind/name/desc 纵向分区不重叠、名称/描述文字高度不溢出分区、三卡点击区稳定，
//    并生成真实验收截图（桌面 + 手机横屏/竖屏）。
// 用法：CHROME_PATH=/usr/bin/chromium E2E_URL=http://127.0.0.1:4173/ node e2e/verify-levelup-layout.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.E2E_URL || 'http://127.0.0.1:4173/';
const OUT = 'e2e/shots';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const isNoise = (t) => /favicon|404 \(Not Found\)/.test(t);
const results = [];
const check = (name, ok, detail = '') => { results.push([name, !!ok, detail]); console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  [' + detail + ']' : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox','--disable-dev-shm-usage'] });

const geoms = (page) => page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const p = s.panel;
  const g = p.cards.map((c, i) => {
    const L = p.layout.cards[i];
    const z = L.zone;
    return {
      i,
      card: { cx: c.bg.x, cy: c.bg.y, w: c.bg.displayWidth, h: c.bg.displayHeight },
      expect: { cy: L.cy, kindY: z.kindY, nameY: z.nameY, descY: z.descY },
      actual: {
        kind: c.kind.y, name: c.name.y, desc: c.desc.y,
        kindH: c.kind.height, nameH: c.name.height, descH: c.desc.height,
        nameW: c.name.width, descW: c.desc.width
      },
      zone: z,
      texts: { kind: c.kind.text, name: c.name.text, desc: c.desc.text }
    };
  });
  return { visible: p.visible, cards: g };
});

// 轮询等待卡片 tween 完成（比固定 sleep 抗负载抖动）：各对象停在基准 y 即视为稳定
async function waitSettled(page, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const info = await geoms(page);
    const settled = info.cards.length > 0 && info.cards.every((c) => {
      // 收敛阈值必须严于后续断言(0.001)：只有真正静止在基准 y 才算稳定，
      // 否则 tween 从 0.05 收敛到 0.001 的窗口期内会误报失败（见 92 竖屏长中文 flake）
      return Math.abs(c.actual.kind - c.expect.kindY) < 0.0005 &&
             Math.abs(c.actual.name - c.expect.nameY) < 0.0005 &&
             Math.abs(c.actual.desc - c.expect.descY) < 0.0005 &&
             Math.abs(c.card.cy - c.expect.cy) < 0.0005;
    });
    if (settled) return { ok: true, info };
    if (Date.now() > deadline) return { ok: false, info };
    await page.waitForTimeout(200);
  }
}


// 注入"长中文"升级选项：覆盖用户截图场景（真实滚到的短文案外，还要保证长文案不叠印/不越界）
// v0.7.1：加入"无空格纯中文"极值（历史上 Phaser wordWrap 对无空格中文整段不折行、
//   desc 横排到 675px 远超 maxW≈280 的缺陷入参），覆盖混合空格短句两种形态。
const LONG_OPTS = [
  { kind: 'evolution', id: 'railgun', name: '大肥鱼磁暴轨道歼星炮改三型', desc: '进化穿透一切射速拉满并且获得额外的暴击率加成与更远的射程再加一层鲸鱼护盾叠满更持久更高' },
  { kind: 'weapon_level', id: 'sniper', name: '大肥鱼狙击枪终级形态完全解放完全体', desc: '高伤慢速贯穿一排并附带小型爆炸对密集敌群造成范围伤害代价是换弹时间略长' },
  { kind: 'passive', id: 'scope', name: '超长名字女仆头饰瞄准镜终极进化再进化', desc: '伤害 +8% 且经验 +10%，同时扩大拾取范围，每级再额外叠加 2% 的暴击与 1% 移速，越叠越强' }
];

async function injectLongCn(page, label) {
  await page.evaluate((opts) => {
    const s = window.__game.scene.getScene('Game');
    s.panel.show(opts, () => {});
  }, LONG_OPTS.map(o => ({ ...o })));
  const settled = await waitSettled(page);
  const info = settled.info;
  const ok = info.cards.length === 3 && info.cards.every((c) => {
    const top = c.card.cy - c.card.h / 2;
    const bottom = c.card.cy + c.card.h / 2;
    // 1) 三个文本落在各自分区且互不交叠
    const kindsOk = Math.abs(c.actual.kind - c.expect.kindY) < 0.001;
    const namesOk = Math.abs(c.actual.name - c.expect.nameY) < 0.001;
    const descsOk = Math.abs(c.actual.desc - c.expect.descY) < 0.001;
    const nameTop = c.actual.name - c.actual.nameH / 2;
    const nameBottom = c.actual.name + c.actual.nameH / 2;
    const descTop = c.actual.desc - c.actual.descH / 2;
    const descBottom = c.actual.desc + c.actual.descH / 2;
    // 2) 不越卡片边界 + 每行宽不超分区宽（v0.7.1 根因回归：Phaser wordWrap 对无空格纯中文不折行）
    const zonesOk = c.actual.nameH <= c.zone.nameMaxH + 0.01 && c.actual.descH <= c.zone.descMaxH + 0.01 &&
                    c.actual.nameW <= c.zone.nameMaxW + 1 && c.actual.descW <= c.zone.descMaxW + 1;
    const orderOk = nameTop >= top && nameBottom <= bottom && descTop >= nameBottom - 0.01 && descBottom <= bottom + 0.01;
    return kindsOk && namesOk && descsOk && zonesOk && orderOk;
  });
  await page.screenshot({ path: `${OUT}/${label}-longcn.png` });
  return { ok, info };
}

// 纯中文无空格长描述（v0.8.0 根因最极端复现：Phaser wordWrap 无空格绝不折行）
const PURE_CN_OPTS = [
  { kind: 'evolution', id: 'railgun', name: '大肥鱼磁暴轨道歼星炮改三型终极形态完全解放', desc: '进化！穿透一切！射速拉满！获得额外暴击率加成与更远的射程，再加一层鲸鱼护盾，叠满更持久，全中文无空格绝不换行的极端用例' },
  { kind: 'weapon_level', id: 'sniper', name: '大肥鱼狙击枪终级形态完全解放', desc: '高伤慢速贯穿一排附带小型爆炸对密集敌群造成范围伤害代价是换弹时间略长' },
  { kind: 'passive', id: 'scope', name: '女仆头饰瞄准镜终极进化再进化', desc: '伤害提升且经验增加同时扩大拾取范围每级再额外叠加暴击与移速越叠越强' }
];

async function injectPureCn(page, label) {
  await page.evaluate((opts) => {
    const s = window.__game.scene.getScene('Game');
    s.panel.show(opts, () => {});
  }, PURE_CN_OPTS.map(o => ({ ...o })));
  const settled = await waitSettled(page);
  const info = settled.info;
  const ok = info.cards.length === 3 && info.cards.every((c) => {
    const z = c.zone;
    const top = c.card.cy - c.card.h / 2;
    const bottom = c.card.cy + c.card.h / 2;
    const nameTop = c.actual.name - c.actual.nameH / 2;
    const nameBottom = c.actual.name + c.actual.nameH / 2;
    const descTop = c.actual.desc - c.actual.descH / 2;
    const descBottom = c.actual.desc + c.actual.descH / 2;
    const widthOk = c.actual.nameW <= z.nameMaxW + 1 && c.actual.descW <= z.descMaxW + 1;
    const heightOk = c.actual.nameH <= z.nameMaxH + 0.01 && c.actual.descH <= z.descMaxH + 0.01;
    const posOk = Math.abs(c.actual.kind - c.expect.kindY) < 0.001 &&
                  Math.abs(c.actual.name - c.expect.nameY) < 0.001 &&
                  Math.abs(c.actual.desc - c.expect.descY) < 0.001;
    const orderOk = nameTop >= top && nameBottom <= bottom && descTop >= nameBottom - 0.01 && descBottom <= bottom + 0.01;
    return widthOk && heightOk && posOk && orderOk;
  });
  await page.screenshot({ path: `${OUT}/${label}-purecn.png` });
  return { ok, info };
}

async function runViewport(ctx, vp, label) {
  const page = await ctx.newPage({ viewport: { width: vp.w, height: vp.h } });
  page.on('pageerror', e => errors.push(`[${label} pageerror] ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !isNoise(m.text())) errors.push(`[${label} console.error] ${m.text()}`); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const cvs = await page.locator('canvas').first().boundingBox();
  const l2p = (lx, ly) => ({ x: cvs.x + (lx / 1280) * cvs.width, y: cvs.y + (ly / 720) * cvs.height });

  // 进入游戏
  const p0 = l2p(640, 230);
  await page.mouse.click(p0.x, p0.y);
  await page.waitForTimeout(1800);

  // 触发升级
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.levelSys.addXp(s.levelSys.need, 1);
    s.checkLevelUp();
  });
  const settled = await waitSettled(page);
  if (!settled.ok) console.log(`  [${label}] tween 未在预期内稳定，继续截图诊断`);
  const info = settled.info;
  check(`${label}: 升级面板已打开`, info.visible === true);
  check(`${label}: 卡片与文字均未叠印（kind/name/desc 不同 y 且间距足够）`,
    info.cards.every(c =>
      (c.actual.desc - c.actual.name > 90) && (c.actual.name - c.actual.kind > 40)
    ),
    info.cards.map(c => `k=${c.actual.kind.toFixed(0)} n=${c.actual.name.toFixed(0)} d=${c.actual.desc.toFixed(0)}`).join(' | '));

  // 核心回归：每个对象停在各自基准 y（根因断言）
  check(`${label}: 各对象停在独立基准 y（bg/kind/name/desc 各归其位）`,
    info.cards.every(c =>
      Math.abs(c.actual.kind - c.expect.kindY) < 0.001 &&
      Math.abs(c.actual.name - c.expect.nameY) < 0.001 &&
      Math.abs(c.actual.desc - c.expect.descY) < 0.001 &&
      Math.abs(c.card.cy - c.expect.cy) < 0.001
    ),
    info.cards.map(c => `bg=${c.card.cy.toFixed(0)}/${c.expect.cy} k=${c.actual.kind.toFixed(0)}/${c.expect.kindY} n=${c.actual.name.toFixed(0)}/${c.expect.nameY} d=${c.actual.desc.toFixed(0)}/${c.expect.descY}`).join(' | '));

  // 文字不溢出：高度 <= 分区高 AND 宽度 <= 分区宽（v0.7.1 根因回归：无空格纯中文横排溢出）
  check(`${label}: 名称/描述文字不溢出分区（高+宽）`,
    info.cards.every(c =>
      c.actual.nameH <= c.zone.nameMaxH + 0.01 &&
      c.actual.descH <= c.zone.descMaxH + 0.01 &&
      c.actual.nameW <= c.zone.nameMaxW + 1 &&
      c.actual.descW <= c.zone.descMaxW + 1
    ),
    info.cards.map(c => `name ${c.actual.nameH.toFixed(0)}x${c.actual.nameW.toFixed(0)}/${c.zone.nameMaxH.toFixed(0)}x${c.zone.nameMaxW.toFixed(0)} desc ${c.actual.descH.toFixed(0)}x${c.actual.descW.toFixed(0)}/${c.zone.descMaxH.toFixed(0)}x${c.zone.descMaxW.toFixed(0)}`).join(' | '));
  check(`${label}: 名称/描述文字带不越卡片边界`,
    info.cards.every(c => {
      const top = c.card.cy - c.card.h / 2;
      const bottom = c.card.cy + c.card.h / 2;
      const nameTop = c.actual.name - c.actual.nameH / 2;
      const nameBottom = c.actual.name + c.actual.nameH / 2;
      const descTop = c.actual.desc - c.actual.descH / 2;
      const descBottom = c.actual.desc + c.actual.descH / 2;
      return nameTop >= top && nameBottom <= bottom && descTop >= nameBottom && descBottom <= bottom;
    }),
    info.cards.map(c => `name[${(c.actual.name - c.actual.nameH / 2).toFixed(0)},${(c.actual.name + c.actual.nameH / 2).toFixed(0)}] desc[${(c.actual.desc - c.actual.descH / 2).toFixed(0)},${(c.actual.desc + c.actual.descH / 2).toFixed(0)}] card[${(c.card.cy - c.card.h / 2).toFixed(0)},${(c.card.cy + c.card.h / 2).toFixed(0)}]`).join(' | '));

  // v0.7.1：name 文本带与 desc 文本带互不重叠（文字高度后仍保持分区隔离）
  check(`${label}: name/desc 文字带无重叠`,
    info.cards.every(c => {
      const nameBottom = c.actual.name + c.actual.nameH / 2;
      const descTop = c.actual.desc - c.actual.descH / 2;
      return descTop >= nameBottom - 0.01;
    }),
    info.cards.map(c => `nameBottom=${(c.actual.name + c.actual.nameH / 2).toFixed(1)} descTop=${(c.actual.desc - c.actual.descH / 2).toFixed(1)} gap=${(c.actual.desc - c.actual.descH / 2 - c.actual.name - c.actual.nameH / 2).toFixed(1)}`).join(' | '));

  // 三卡点击区域：卡片矩形互不交叠且全部在画布内
  check(`${label}: 三卡点击区域稳定且互不遮挡、不出屏`,
    info.cards.every((c, i) => {
      const okIn = c.card.cx - c.card.w / 2 >= 0 && c.card.cx + c.card.w / 2 <= 1280 && c.card.cy - c.card.h / 2 >= 0 && c.card.cy + c.card.h / 2 <= 720;
      for (let j = i + 1; j < info.cards.length; j++) {
        const o = info.cards[j];
        if (c.card.cx < o.card.cx + o.card.w / 2 && o.card.cx < c.card.cx + c.card.w / 2 &&
            c.card.cy < o.card.cy + o.card.h / 2 && o.card.cy < c.card.cy + c.card.h / 2) return false;
      }
      return okIn;
    }),
    info.cards.map(c => `[${c.card.cx.toFixed(0)},${c.card.cy.toFixed(0)},${c.card.w.toFixed(0)}x${c.card.h.toFixed(0)}]`).join(' | '));

  await page.screenshot({ path: `${OUT}/${label}-levelup.png` });

  // 点击可选区域有效：点中间卡能真实选择并关闭面板
  const mid = info.cards[1];
  const pm = l2p(mid.card.cx, mid.card.cy);
  await page.mouse.click(pm.x, pm.y);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__game.scene.getScene('Game').panel.visible);
  check(`${label}: 点选中间卡后面板关闭（点击区域有效）`, after === false);

  // 长中文注入验收（同一视口：真实滚动选项 + 长中文极值）
  const longOut = await injectLongCn(page, label);
  check(`${label}: 长中文 kind/name/desc 各归其位、不越界不交叠（含缩字）`, longOut.ok,
    longOut.info.cards.map(c => `k=${c.actual.kind.toFixed(0)}/${c.expect.kindY.toFixed(0)} n=${c.actual.name.toFixed(0)}/${c.expect.nameY.toFixed(0)} d=${c.actual.desc.toFixed(0)}/${c.expect.descY.toFixed(0)} nameH=${c.actual.nameH.toFixed(0)}/${c.zone.nameMaxH.toFixed(0)} descH=${c.actual.descH.toFixed(0)}/${c.zone.descMaxH.toFixed(0)}`).join(' | '));

  // 纯中文无空格长描述（根因最极端复现：必须逐字符折行）
  const pureOut = await injectPureCn(page, label);
  check(`${label}: 纯中文无空格长描述不越宽/不越界/不交叠`, pureOut.ok,
    pureOut.info.cards.map(c => `nameW=${c.actual.nameW.toFixed(0)}/${c.zone.nameMaxW.toFixed(0)} descW=${c.actual.descW.toFixed(0)}/${c.zone.descMaxW.toFixed(0)} nameH=${c.actual.nameH.toFixed(0)}/${c.zone.nameMaxH.toFixed(0)} descH=${c.actual.descH.toFixed(0)}/${c.zone.descMaxH.toFixed(0)}`).join(' | '));
  await page.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.panel.hide(); });
  await page.waitForTimeout(300);
  await page.close();
}

// 桌面 + 手机横屏（用户最可能设备比例）+ 手机竖屏
const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await runViewport(desktop, { w: 1280, h: 720 }, '90-desktop-levelup');

const phoneLand = await browser.newContext({ viewport: { width: 932, height: 430 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
await runViewport(phoneLand, { w: 932, h: 430 }, '91-phone-landscape-levelup');

const phonePort = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
await runViewport(phonePort, { w: 390, h: 844 }, '92-phone-portrait-levelup');

const flatPort = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await runViewport(flatPort, { w: 360, h: 640 }, '93-flat-portrait-levelup');

await browser.close();

const failed = results.filter(r => !r[1]).length;
console.log(`\n===== 升级面板布局验收结果 =====`);
for (const [n, ok, d] of results) console.log(`${ok ? '✔' : '✘'} ${n}${d ? '  [' + d + ']' : ''}`);
if (errors.length) { console.log('--- 页面/控制台错误 ---'); for (const e of errors) console.log(e); }
console.log(failed === 0 && errors.length === 0 ? 'pass' : `FAIL (${failed} failed, ${errors.length} page errors)`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
