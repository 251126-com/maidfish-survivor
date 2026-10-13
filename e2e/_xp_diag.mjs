import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport:{width:1280,height:720} });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push('PAGE:'+e.message.slice(0,300)));
page.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE:'+m.text().slice(0,300)); });
await page.goto('https://251126-com.github.io/maidfish-survivor/', {waitUntil:'load', timeout:60000});
await page.waitForTimeout(3000);
const info = await page.evaluate(()=>{
  const w=window; const g=w.__game;
  const r = { hasGame: !!g, version: w.__VERSION,
    rendererType: g?.renderer?.type,
    scenes: g?.scene?.scenes?.map(s=>s.scene.key+':'+s.sys.isActive()),
    paused: g?.isPaused,
    booted: g?.isBooted,
    loopRunning: g?.loop?.running };
  let canvas=null;
  const c=document.querySelector('#game canvas');
  if(c){ canvas={ w:c.width, h:c.height, cw:c.clientWidth, ch:c.clientHeight }; }
  return { r, canvas, errors: (window.__errs||[]) };
});
console.log('INFO', JSON.stringify(info));
console.log('ERRS', JSON.stringify(errs));
await page.screenshot({ path:'e2e/shots/experience-review/online/diag.png' });
await b.close();
