import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport:{width:1280,height:720} });
await page.goto('http://127.0.0.1:4173/', {waitUntil:'load'});
await page.waitForTimeout(1200);
await page.evaluate(()=>{
  window.__resizeCalls = 0;
  window.addEventListener('resize', ()=> window.__resizeCalls++);
  const g = window.__game;
  const origRefresh = g.scale.refresh.bind(g.scale);
  window.__refreshCalls = 0;
  g.scale.refresh = (...a) => { window.__refreshCalls++; return origRefresh(...a); };
  window.__rafCalls = 0;
});
const snap = (tag) => page.evaluate((t)=>{
  const g = window.__game;
  const cnv = document.querySelector('#game canvas');
  return { t, rc: window.__resizeCalls, rf: window.__refreshCalls,
           parent: `${g.scale.parentSize.width}x${g.scale.parentSize.height}`,
           disp: `${g.scale.displaySize.width}x${g.scale.displaySize.height}`,
           bound: +cnv.getBoundingClientRect().width.toFixed(1) };
}, tag);
console.log(JSON.stringify(await snap('before')));
await page.setViewportSize({width:900,height:600});
await page.waitForTimeout(400);
console.log(JSON.stringify(await snap('after setViewport(900x600) 400ms')));
await page.waitForTimeout(800);
console.log(JSON.stringify(await snap('after +800ms')));
await b.close();
