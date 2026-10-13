import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport:{width:1280,height:720} });
const errs=[]; page.on('pageerror',e=>errs.push('PAGE:'+String(e).slice(0,250)));
page.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE:'+m.text().slice(0,250)); });
await page.goto('http://127.0.0.1:4173/', {waitUntil:'load', timeout:60000});
await page.waitForTimeout(2000);
await page.mouse.click(640, 216); // start
await page.waitForTimeout(2000);
const snap=()=>page.evaluate(()=>{ const g=window.__game,s=g.scene.getScene('Game'); if(!s||!s.player) return {scene:false};
  return {scene:true, fps:Math.round(g.loop.actualFps||0), elapsed:+s.elapsed.toFixed(1), px:Math.round(s.player.x),py:Math.round(s.player.y),
    hp:Math.round(s.player.stats.hp), kills:s.kills, xp:Math.round(s.levelSys?.xp??0), level:s.levelSys?.level??0,
    enemies:s.enemies?.count??0, bullets:s.weapons?.bulletCount??0, weapons:s.weapons?.owned?.map(w=>w.id), panel:!!s.panel?.visible,
    aim: s.player.aimX!=null?`(${Math.round(s.player.aimX)},${Math.round(s.player.aimY)})`:'null' };
});
// 每 2s 打点 30s
for(let i=0;i<16;i++){
  await page.keyboard.down('d'); await page.waitForTimeout(900); await page.keyboard.up('d');
  await page.keyboard.down('s'); await page.waitForTimeout(900); await page.keyboard.up('s');
  const s=await snap(); console.log('T',i*2, JSON.stringify(s));
  if(s.panel){ console.log('PANEL_VISIBLE'); break; }
}
console.log('ERRS', JSON.stringify(errs));
await b.close();
