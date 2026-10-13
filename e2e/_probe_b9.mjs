import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport:{width:1280,height:720} });
await page.goto('http://127.0.0.1:4173/', {waitUntil:'load'});
await page.waitForTimeout(1200);
const measure = () => page.evaluate(()=>{
  const cnv = document.querySelector('#game canvas');
  const g = document.getElementById('game');
  const r = cnv.getBoundingClientRect();
  return { iw: window.innerWidth, ih: window.innerHeight, cw: +r.width.toFixed(1), ch: +r.height.toFixed(1),
           gameW: g.clientWidth, gameH: g.clientHeight };
});
const log=[];
log.push({t:'initial', ...await measure()});
await page.setViewportSize({width:900,height:600});
for (let i=0;i<8;i++){ await page.waitForTimeout(150); log.push({t:'900x600 +'+(i+1)*0.3+'s', ...await measure()}); }
await page.setViewportSize({width:1280,height:720});
for (let i=0;i<6;i++){ await page.waitForTimeout(300); log.push({t:'back1280 +'+(i+1)*0.3+'s', ...await measure()}); }
for (const l of log) console.log(JSON.stringify(l));
await b.close();
