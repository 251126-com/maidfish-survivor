import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args:['--no-sandbox','--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport:{width:1280,height:720} });
const errs=[]; const cons=[];
page.on('pageerror',e=>errs.push(e.message));
page.on('console',m=>{ if(m.type()==='error') cons.push(m.text()); });
await page.goto('http://127.0.0.1:4173/', {waitUntil:'load'});
await page.waitForTimeout(1500);
await page.mouse.click(640,230);
await page.waitForTimeout(1500);

// 1) delayedCall 是否触发
await page.evaluate(()=>{ const s=window.__game.scene.getScene('Game'); s.time.delayedCall(400, ()=>{ window.__DC='fired'; }); });
await page.waitForTimeout(700);
const dc = await page.evaluate(()=>window.__DC??null);
console.log('T1 delayedCall fires:', dc);

// 2) 直接 scene.start('Result') 是否成功
await page.evaluate(()=>{ const s=window.__game.scene.getScene('Game'); s.scene.start('Result', {win:true,time:60,kills:5,level:3,gold:100}); });
await page.waitForTimeout(800);
const st2 = await page.evaluate(()=>window.__game.scene.scenes.map(s=>({k:s.scene.key,st:s.sys.settings.status,a:s.sys.isActive()})));
console.log('T2 after direct scene.start(Result):', JSON.stringify(st2));

// 3) 回 Game 后 finish(true)，观察 2.5s
await page.evaluate(()=>window.__game.scene.start('Game'));
await page.waitForTimeout(1500);
await page.evaluate(()=>{ const s=window.__game.scene.getScene('Game'); s.finish(true); });
for (let i=1;i<=8;i++){ await page.waitForTimeout(300); const st=await page.evaluate(()=>window.__game.scene.scenes.map(s=>({k:s.scene.key,st:s.sys.settings.status}))); console.log((i*300)+'ms', JSON.stringify(st)); }
console.log('PAGEERRORS', JSON.stringify(errs));
console.log('CONSOLE_ERR', JSON.stringify(cons.slice(0,8)));
await b.close();
