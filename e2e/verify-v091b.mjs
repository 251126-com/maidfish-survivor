// v0.9.1b 专项验收（单浏览器串行）：承接用户清单剩余项
//  B1 弹幕池长用不停火   B2 过期/已释放弹不碰撞
//  B3 boss 跨阶段取消→清预警+反馈+不无预警爆炸   B4 技能预警真实绘制
//  B5 公平 dash：预警起点与冲刺路径一致
//  B6 存档污染只读清洗展示不崩   B7 真实购买强化后保留起始背景
//  B8 全屏 Promise 拒绝→failed+toast   B9 resize 后画布 FIT 不回归
// headless 下 RAF≈11fps、Phaser fps.min=30 游戏时钟慢于真实时间：
//  本脚本全部用「直接驱动场景/条件轮询」，不依赖固定 sleep 等真实时间。
// 用法：E2E_URL=http://127.0.0.1:4173/ node e2e/verify-v091b.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.E2E_URL || 'http://127.0.0.1:4173/';
const OUT = 'e2e/shots/v091b';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const results = [];
const isNoise = (t) => /favicon|404 \(Not Found\)/.test(t);
const check = (name, ok, detail = '') => { results.push([name, !!ok, detail]); console.log(`${ok ? '✔' : '✘'} ${name}${detail ? '  [' + detail + ']' : ''}`); };

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !isNoise(m.text())) errors.push(`[console.error] ${m.text()}`); });

const gotoMenu = async () => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
};
const enterGame = async () => {
  await gotoMenu();
  await page.mouse.click(640, 230);
  await page.waitForTimeout(1200);
};

// ================= B1/B2 弹幕池：长用 + 过期弹不碰撞（真实 GameScene 接线） =================
await enterGame();
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.spawnTimer = 99999;
  s.player.stats.hp = 9999; s.player.stats.maxHp = 9999;
  s.player.invuln = 0;
});
try {
  const pool = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    const bs = s.enemyBullets;
    let fail = 0;
    for (let i = 0; i < 160; i++) {               // 超过真实上限 120
      const b = bs.spawn(s.player.x, s.player.y, 0.3, 300, 10, 7, 0.001);
      if (!b) fail++;
      bs.update(0.02);                             // 每帧过期+compact
    }
    return { fail, peak: bs.pool.peak, count: bs.count, limit: bs.pool.limit };
  });
  check('B1a 160 发连射不停火（compact 保证容量）', pool.fail === 0, JSON.stringify(pool));
  check('B1b 池峰值/存活数不超上限', pool.peak <= pool.limit && pool.count <= pool.limit && pool.count >= 0, JSON.stringify(pool));
  await page.screenshot({ path: `${OUT}/b1-pool.png` });

  const expired = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    const bs = s.enemyBullets;
    const hp0 = s.player.stats.hp;
    // 过期路径：落在玩家身上但寿命极短
    const b1 = bs.spawn(s.player.x, s.player.y, 0, 0, 10, 7, 0.001);
    bs.update(0.02);
    const expiredActive = b1.active;
    s.collideEnemyBullets();
    const hp1 = s.player.stats.hp;
    // 已释放路径：长寿命但被人为 release（如跨帧命中后的回收）
    const b2 = bs.spawn(s.player.x, s.player.y, 0, 0, 10, 7, 100);
    bs.pool.release(b2);
    s.collideEnemyBullets();
    const hp2 = s.player.stats.hp;
    return { expiredActive, hp0, hp1, hp2 };
  });
  check('B2a 过期弹被回收为 inactive', expired.expiredActive === false, JSON.stringify(expired));
  check('B2b 过期弹不再造成伤害', expired.hp0 === expired.hp1, `hp ${expired.hp0}->${expired.hp1}`);
  check('B2c 已释放弹不再造成伤害', expired.hp1 === expired.hp2, `hp ${expired.hp1}->${expired.hp2}`);
} catch (e) { errors.push('[B1/B2 exception] ' + e.message); }

// ================= B3/B4/B5 Boss：跨阶段取消 / 技能预警 / 公平 dash =================
try {
  const boss = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.paused = true;                                  // 作为纯数据冻结（不弹暂停遮罩）
    s.elapsed = 600;                                  // BOSS_TIME=600
    s.bossSpawned = false;
    s.updateSpawner(0.016);                            // 走真实登场路径：spawn boss + new BossBrain
    const be = s.bossEnemy;
    const br = s.bossBrain;
    return { hasBoss: !!be && !!br, beX: be?.x ?? -1, beY: be?.y ?? -1, hp: be?.hp ?? 0, maxHp: be?.maxHp ?? 0 };
  });
  check('B3a 自然登场路径已生成 boss 与 BossBrain', boss.hasBoss, JSON.stringify(boss));

  // ---- B4 技能预警（circle）：WarningCircles 生成 + 真实绘制进 Graphics ----
  const warn = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    const br = s.bossBrain;
    const be = s.bossEnemy;
    const p = s.player;
    const ratio = be.hp / be.maxHp;
    br.pickSkill = () => 'circle';
    br.state = 'idle'; br.stateT = 0;
    let tep = null;
    for (let i = 0; i < 30 && !tep; i++) {
      const evs = br.step(0.6, ratio, p.x, p.y);
      tep = evs.find(e => e.type === 'telegraph-start');
    }
    s.drawBossTelegraph(br);
    return {
      tepSkill: tep?.skill ?? null,
      circles: br.warningCircles.length,
      bufLen: s.bossTeleG.commandBuffer.length,
      circle0: br.warningCircles.length ? { x: Math.round(br.warningCircles[0].x), y: Math.round(br.warningCircles[0].y) } : null,
      px: Math.round(p.x), py: Math.round(p.y)
    };
  });
  check('B4a 红圈预警参数生成且贴玩家', warn.tepSkill === 'circle' && warn.circles > 0 && warn.circle0 && Math.abs(warn.circle0.x - warn.px) < 1 && Math.abs(warn.circle0.y - warn.py) < 1, JSON.stringify(warn));
  check('B4b 预警真实绘制到 Graphics', warn.bufLen > 0, `commandBuffer=${warn.bufLen}`);
  await page.screenshot({ path: `${OUT}/b4-telegraph-circle.png` });

  // ---- B3 跨阶段取消：act 中掉血跨阈值 → skill-cancel、清预警、反馈、不补爆炸 ----
  const cancel = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    const br = s.bossBrain;
    const be = s.bossEnemy;
    const p = s.player;
    const ratio = be.hp / be.maxHp;
    // 完成 telegraph → act（红圈炸裂点）
    let ev2 = [];
    for (let i = 0; i < 20 && !br.inAct; i++) ev2.push(...br.step(0.2, ratio, p.x, p.y));
    // 玩家故意站进圈范围，受伤前 hp
    const hpBefore = s.player.stats.hp;
    // 跨阶段：血量掉到 P2
    be.hp = 0.3 * be.maxHp;
    const ev3 = br.step(0.05, 0.3, p.x, p.y);
    const cancelEv = ev3.find(e => e.type === 'skill-cancel');
    const hasActEnd = ev3.some(e => e.type === 'act-end');
    for (const e of ev3) s.handleBossEvent(e, br, be);   // GameScene 真实接线
    const hpAfter = s.player.stats.hp;
    const teleCleared = s.bossTeleG.commandBuffer.length === 0;
    const cancelText = s.children.list.some(o => o.type === 'Text' && typeof o.text === 'string' && o.text.includes('技能被打断'));
    return {
      hadAct: ev2.length > 0 && br.state !== null, cancelSkill: cancelEv?.skill ?? null,
      hasActEnd, hpBefore, hpAfter, teleCleared, cancelText,
      warnCirclesAfter: br.warningCircles.length, state: br.state
    };
  });
  check('B3b act 中跨阶段发 skill-cancel 且不触发 act-end（不补无预警爆炸）', cancel.cancelSkill === 'circle' && cancel.hasActEnd === false, JSON.stringify(cancel));
  check('B3c 打断后预警圈清空、预警参数清空', cancel.warnCirclesAfter === 0 && cancel.state === 'roar', JSON.stringify(cancel));
  check('B3d GameScene 接线：Graphics 预警清空', cancel.teleCleared, '');
  check('B3e GameScene 接线：反馈文字出现', cancel.cancelText === true, '');
  check('B3f 不无预警爆炸：站圈内玩家不掉血', cancel.hpBefore === cancel.hpAfter, `hp ${cancel.hpBefore}->${cancel.hpAfter}`);
  await page.screenshot({ path: `${OUT}/b3-skill-cancel.png` });

  // ---- B5 公平 dash：预警起点 == 冲刺起点，且冲线方向与预警线一致 ----
  const dash = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    const br = s.bossBrain;
    const be = s.bossEnemy;
    retainDash: {
      for (let i = 0; i < 40 && br.state !== 'idle'; i++) br.step(0.2, 0.3, s.player.x, s.player.y);   // roar 结束回 idle
      br.pickSkill = () => 'dash';
      let tep = null;
      for (let i = 0; i < 30 && !tep; i++) {
        const evs = br.step(0.6, 0.3, s.player.x, s.player.y);
        tep = evs.find(e => e.type === 'telegraph-start');
      }
      const t = br.telegraphParams;
      const dashFromX = t.dashFromX; const dashFromY = t.dashFromY;
      const dirX = t.dashDirX; const dirY = t.dashDirY;
      // 故意把 Boss 挪开，验证 GameScene 冻结逻辑把位置拉回预警起点
      be.x = dashFromX + 300; be.y = dashFromY - 300;
      s.updateBoss(0.016);
      const frozenOk = Math.abs(be.x - dashFromX) < 0.01 && Math.abs(be.y - dashFromY) < 0.01;
      // 预警线起点必须等于 dashFrom
      s.bossTeleG.clear();
      s.drawBossTelegraph(br);
      let lineStart = null;
      for (const cmd of s.bossTeleG.commandBuffer) {
        if (cmd && Array.isArray(cmd.pathData) && cmd.pathData.length >= 2) {
          lineStart = [cmd.pathData[0], cmd.pathData[1]];
          if (Math.abs(cmd.pathData[0] - dashFromX) < 0.01 && Math.abs(cmd.pathData[1] - dashFromY) < 0.01) break;
        }
      }
      // 推进到 act 并移动，验证实际路径方向与距离
      for (let i = 0; i < 20 && !br.dashing; i++) s.updateBoss(0.05);
      const speed = br.dashSpeed;
      const x0 = be.x, y0 = be.y;
      for (let i = 0; i < 3; i++) s.updateBoss(0.05);   // 0.15s 冲刺
      const expX = dashFromX + dirX * speed * 0.15;
      const expY = dashFromY + dirY * speed * 0.15;
      const dx = be.x - expX, dy = be.y - expY;
      const pathOk = Math.hypot(dx, dy) < 2;
      return {
        dashFromX: Math.round(dashFromX), dashFromY: Math.round(dashFromY),
        dirX: +dirX.toFixed(3), dirY: +dirY.toFixed(3),
        frozenOk, lineStart, lineOk: lineStart && Math.abs(lineStart[0]-dashFromX) < 0.01 && Math.abs(lineStart[1]-dashFromY) < 0.01,
        x0: Math.round(x0), y0: Math.round(y0),
        beX: Math.round(be.x), beY: Math.round(be.y),
        expX: Math.round(expX), expY: Math.round(expY), pathOk, speed
      };
    }
  });
  check('B5a dash 预警起点被冻结（Boss 位置=预警起点）', dash.frozenOk === true, JSON.stringify(dash));
  check('B5b 预警线起点 == dashFrom（预警与冲刺同一坐标系）', dash.lineOk === true, JSON.stringify(dash));
  check('B5c 冲刺实际落点 ≈ 预警线方向*速度*时间（公平 dash）', dash.pathOk === true, JSON.stringify(dash));
  await page.screenshot({ path: `${OUT}/b5-dash.png` });

  await page.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.paused = false; s.player.stats.hp = 9999; });
} catch (e) { errors.push('[B3/B4/B5 exception] ' + e.message); }
await page.close();

// ================= B6 存档污染：只读清洗展示、不崩 =================
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p6 = await ctx.newPage();
  p6.on('pageerror', e => errors.push(`[B6 pageerror] ${e.message}`));
  await p6.goto(URL, { waitUntil: 'load' });
  await p6.evaluate(() => {
    // 直写污染存档：Infinity(1e309)/越界 rank/负数/NaN 等
    localStorage.setItem('maidfish-survivor-save-v1',
      '{"gold":1e309,"meta":{"meta_atk":99999,"meta_hp":-4,"meta_spd":2.9},"best":{"time":-10,"kills":5,"level":1e308}}');
  });
  await p6.reload({ waitUntil: 'load' });
  await p6.waitForTimeout(1500);
  const menu = await p6.evaluate(() => {
    const txt = document.body.innerText;
    return {
      goldZero: txt.includes('金币：0'),
      atkCapped: /攻击强化\s+Lv\.10\/10/.test(txt),
      hpZero: /体能训练\s+Lv\.0\/10/.test(txt),
      best: /最佳：0分0秒 · 击杀 5 · 最高 Lv\.0/.test(txt),
      noInfinity: !txt.includes('Infinity') && !/NaN/.test(txt)
    };
  });
  check('B6a 污染 gold=Infinity 展示为 金币：0', menu.goldZero, JSON.stringify(menu));
  check('B6b 越界 meta_atk 封顶 Lv.10/10', menu.atkCapped, JSON.stringify(menu));
  check('B6c 负数 meta_hp 清洗为 Lv.0/10', menu.hpZero, JSON.stringify(menu));
  check('B6d best 负值/Infinity 清洗展示', menu.best, JSON.stringify(menu));
  check('B6e 界面无 Infinity/NaN 泄漏', menu.noInfinity, JSON.stringify(menu));
  await p6.screenshot({ path: `${OUT}/b6-polluted-save.png` });
  // 污染存档下仍能进游戏
  await p6.mouse.click(640, 230);
  await p6.waitForTimeout(1200);
  const inGame = await p6.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    return { key: s.scene.key, hp: s.player.stats.hp, damageMult: s.player.stats.damageMult ?? 'n/a' };
  });
  check('B6f 污染存档下进入游戏不崩（有限数值）', inGame.key === 'Game' && Number.isFinite(inGame.hp) && Number.isFinite(inGame.damageMult || 1), JSON.stringify(inGame));
  await p6.close();
} catch (e) { errors.push('[B6 exception] ' + e.message); }

// ================= B7 真实购买强化：金币足够、选背景、买卡→restart 后保留 =================
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p7 = await ctx.newPage();
  p7.on('pageerror', e => errors.push(`[B7 pageerror] ${e.message}`));
  await p7.goto(URL, { waitUntil: 'load' });
  await p7.evaluate(() => {
    localStorage.setItem('maidfish-survivor-save-v1',
      JSON.stringify({ version: 1, gold: 1000000, meta: {}, best: { time: 0, kills: 0, level: 0 } }));
  });
  await p7.reload({ waitUntil: 'load' });
  await p7.waitForTimeout(1500);
  await p7.evaluate(() => window.__MENU_BG.set(1));   // 荧光海沟
  const before = await p7.evaluate(() => ({ pick: window.__MENU_BG.get(), img: window.__game.scene.getScene('Menu').bgImage.texture.key }));
  await p7.mouse.click(266, 471);                      // 三列第一行第一张强化卡
  await p7.waitForTimeout(900);                        // 购买 → scene.restart()
  const after = await p7.evaluate(() => ({
    pick: window.__MENU_BG.get(),
    img: window.__game.scene.getScene('Menu').bgImage.texture.key,
    raw: JSON.parse(localStorage.getItem('maidfish-survivor-save-v1'))
  }));
  check('B7a 购买后保留用户所选背景(1/bg_trench)', after.pick === 1 && after.img === 'bg_trench' && before.img === 'bg_trench', JSON.stringify({ before, after: { pick: after.pick, img: after.img } }));
  check('B7b 购买真实扣款且等级+1', Number.isFinite(after.raw.gold) && after.raw.gold < 1000000 && after.raw.meta.meta_atk === 1, `gold=${after.raw.gold} meta_atk=${after.raw.meta.meta_atk}`);
  await p7.screenshot({ path: `${OUT}/b7-purchase-keep-bg.png` });
  await p7.close();
} catch (e) { errors.push('[B7 exception] ' + e.message); }

// ================= B8 全屏 Promise 拒绝 → failed + 文案按真实状态 =================
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p8 = await ctx.newPage();
  p8.on('pageerror', e => errors.push(`[B8 pageerror] ${e.message}`));
  await p8.goto(URL, { waitUntil: 'load' });
  await p8.waitForTimeout(1500);
  const r = await p8.evaluate(async () => {
    const el = document.getElementById('game');
    el.__origFS = el.requestFullscreen;
    el.requestFullscreen = () => Promise.reject(new Error('denied-by-test'));
    const res = await window.__FS.toggle();
    el.requestFullscreen = el.__origFS;   // 恢复
    return res;
  });
  check('B8a Fullscreen 拒绝 → __FS.toggle 返回 failed', r === 'failed', `实际 ${r}`);
  const toast = await p8.evaluate(() => document.body.innerText.includes('全屏请求被拒绝'));
  check('B8b 拒绝后 toast 文案「全屏请求被拒绝」', toast === true, '');
  await p8.screenshot({ path: `${OUT}/b8-fullscreen-failed.png` });
  await p8.close();
} catch (e) { errors.push('[B8 exception] ' + e.message); }

// ================= B9 resize/UI：resize 后画布仍 FIT 等比不越界 =================
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p9 = await ctx.newPage();
  p9.on('pageerror', e => errors.push(`[B9 pageerror] ${e.message}`));
  await p9.goto(URL, { waitUntil: 'load' });
  await p9.waitForTimeout(1400);
  await p9.setViewportSize({ width: 900, height: 600 });
  await p9.waitForTimeout(900);
  const box = await p9.locator('#game canvas').first().boundingBox();
  const ar = box ? box.width / box.height : 0;
  check('B9a resize→900x600 canvas 保持 16:9 FIT 不越界', box && Math.abs(ar - 1280 / 720) < 0.03 && box.width <= 900 && box.height <= 600, `${box?.width?.toFixed(0)}x${box?.height?.toFixed(0)} ar=${ar.toFixed(3)}`);
  await p9.screenshot({ path: `${OUT}/b9-resize-900x600.png` });
  await p9.setViewportSize({ width: 1280, height: 720 });
  await p9.waitForTimeout(800);
  const box2 = await p9.locator('#game canvas').first().boundingBox();
  const ar2 = box2 ? box2.width / box2.height : 0;
  check('B9b 恢复1280x720 canvas 复原 FIT', box2 && Math.abs(ar2 - 1280 / 720) < 0.03 && box2.width <= 1280 && box2.height <= 720, `${box2?.width?.toFixed(0)}x${box2?.height?.toFixed(0)} ar=${ar2.toFixed(3)}`);
  await p9.close();
} catch (e) { errors.push('[B9 exception] ' + e.message); }

await browser.close();

// ================= 汇总 =================
const fails = results.filter(r => !r[1]);
console.log(`\n===== v0.9.1b 验收汇总: ${results.length - fails.length}/${results.length} 通过 =====`);
if (fails.length) { console.log('失败项:'); fails.forEach(r => console.log('  ✘', r[0], r[2])); }
if (errors.length) { console.log('\n页面/脚本错误:'); errors.forEach(e => console.log('  ', e)); }
process.exit(fails.length || errors.length ? 1 : 0);
