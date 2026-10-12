// 真实角色动作预览：用 Playwright 驱动正式游戏，截取"玩家实际贴图"的动作帧。
// 帧来源全部是运行中的真实游戏画面（player_whale.png + 程序化动画），不是原图/概念图。
// 用法：CHROME_PATH=/usr/bin/chromium E2E_URL=http://127.0.0.1:4173/ node tools/make_preview.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.E2E_URL || 'http://127.0.0.1:4173/';
const OUT = 'e2e/shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.mouse.click(640, 230);          // 开始游戏
await page.waitForTimeout(1800);

// 计算角色屏幕包围盒（FIT 缩放映射）
const clipFor = () => page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const b = s.player.sprite.getBounds();
  const cam = s.cameras.main;
  const canvas = document.querySelector('canvas');
  const box = canvas.getBoundingClientRect();
  const scale = box.width / 1280;
  const sx = box.x + (b.x - cam.scrollX) * scale;
  const sy = box.y + (b.y - cam.scrollY) * scale;
  const sw = b.width * scale;
  const sh = b.height * scale;
  const pad = 18;
  return { x: sx - pad, y: sy - pad, width: sw + pad * 2, height: sh + pad * 2 };
});

const shot = async (name) => {
  const c = await clipFor();
  await page.screenshot({ path: `${OUT}/${name}`, clip: c });
  console.log('  预览帧:', name, JSON.stringify(c));
};

// 待机呼吸：同位置隔 ~0.28s 两张（缩放轻微变化）
await shot('preview-idle-a.png');
await page.waitForTimeout(280);
await shot('preview-idle-b.png');

// 移动 bob：按住向右拖，两张不同相位
await page.mouse.move(640, 420);
await page.mouse.down();
await page.mouse.move(840, 420, { steps: 4 });
await page.waitForTimeout(60);
await shot('preview-move-a.png');
await page.waitForTimeout(110);
await shot('preview-move-b.png');
await page.mouse.up();

// 受击挤压：直接触发一次受击，立刻截帧
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.player.invuln = 0;
  s.player.takeDamage(1);
  s.player.stats.hp = 9999;
});
await page.waitForTimeout(16);
await shot('preview-squash.png');

// 开火后坐：触发 onFire 后立刻截帧
await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  s.player.recoilX = 0;
  s.player.onFire();
});
await page.waitForTimeout(16);
await shot('preview-recoil.png');

await browser.close();
console.log('\n预览帧完成，共 7 张。');
