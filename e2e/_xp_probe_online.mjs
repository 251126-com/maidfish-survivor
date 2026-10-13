import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport:{width:1280,height:720} });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e).slice(0,200)));
page.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE:'+m.text().slice(0,200)); });
const p0 = Date.now();
await page.goto('https://251126-com.github.io/maidfish-survivor/', {waitUntil:'load', timeout: 60000});
const loadMs = Date.now()-p0;
await page.waitForTimeout(2500);
const info = await page.evaluate(()=>{
  const w = window;
  const ready = { __game: !!w.__game, VERSION: w.__VERSION, BG: w.__BG_MARK, canvas: !!document.querySelector('#game canvas') };
  let scene = null;
  try { const g = w.__game?.scene?.getScene('Game'); scene = !!g; } catch(e){ scene = 'err:'+e; }
  return { ready, scene };
});
console.log('loadMs', loadMs, JSON.stringify(info));
console.log('errs', JSON.stringify(errs));
await b.close();
