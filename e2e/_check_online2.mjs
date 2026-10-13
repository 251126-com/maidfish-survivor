import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ executablePath:'/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport:{width:1280,height:720} });
const errs=[];
const net=[];
page.on('pageerror',e=>errs.push('PAGE:'+e.message.slice(0,300)));
page.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE:'+m.text().slice(0,300)); });
page.on('requestfailed',r=>errs.push('REQFAIL:'+r.url().slice(0,200)+' :: '+r.failure()?.errorText));
page.on('requestfinished',r=>{ if(/assets|\.js/.test(r.url())) net.push(r.url().split('/').slice(-2).join('/')); });
const t0=Date.now();
const navT=t0;
await page.goto('https://251126-com.github.io/maidfish-survivor/', {waitUntil:'domcontentloaded', timeout:120000});
const timeline=[];
for (let i=0;i<14;i++){
  await page.waitForTimeout(5000);
  try {
    const st = await page.evaluate(()=>{
      const g=window.__game;
      return { v:window.__VERSION, hasGame:!!g, booted:g?.isBooted, loop:g?.loop?.running,
        scenes: g?g.scene.scenes.map(x=>x.scene.key+':'+x.sys.isActive()):null,
        renderer: g?.renderer?.type===3?'WebGL':'Canvas',
        canvas: (()=>{const c=document.querySelector('#game canvas');return c?{w:c.width,h:c.height,cw:c.clientWidth,ch:c.clientHeight}:null})(),
        hasPlayer: (()=>{try{const s=g?.scene?.getScene('Game'); return !!s && !!s.player;}catch{return false}})()
      };
    });
    timeline.push({ms:Date.now()-t0, st});
  } catch(e){ timeline.push({ms:Date.now()-t0, evalErr:String(e).slice(0,120)}); }
  const last=timeline.at(-1);
  if (last?.st?.scenes?.some(s=>s.endsWith(':true')) && last?.st?.v) break;
}
await page.screenshot({path:'e2e/shots/experience-review/online/check2_now.png'});
fs.writeFileSync('e2e/shots/experience-review/online/check2_timeline.json', JSON.stringify({navMs:Date.now()-navT, timeline, errs, net},null,1));
console.log('DONE navMs', Date.now()-navT);
console.log(JSON.stringify(timeline,null,1));
console.log('ERRS', JSON.stringify(errs));
console.log('NET', JSON.stringify(net));
await b.close();
