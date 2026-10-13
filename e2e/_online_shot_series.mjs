import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ executablePath:'/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport:{width:1280,height:720} });
const errs=[];
page.on('pageerror',e=>errs.push('PAGE:'+e.message.slice(0,300)));
page.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE:'+m.text().slice(0,300)); });
const navT=Date.now();
await page.goto('https://251126-com.github.io/maidfish-survivor/', {waitUntil:'load', timeout:90000});
const loadMs=Date.now()-navT;
const OUT='/AstrBot/data/workspaces/snowluma_FriendMessage_2010368297/maidfish-survivor/e2e/shots/experience-review/online';
fs.mkdirSync(OUT,{recursive:true});
let last='';
for (let i=0;i<12;i++){
  await page.waitForTimeout(1000);
  const f=`${OUT}/series_${String(i).padStart(2,'0')}_t${((loadMs+(i+1)*1000)/1000).toFixed(0)}s.png`;
  await page.screenshot({path:f});
  const snap = await page.evaluate(()=>{
    const g=window.__game;
    const scenes=g? g.scene.scenes.map(x=>x.scene.key+':'+x.sys.isActive()).join(',') : 'no-game';
    let overlay='';
    const boot=document.querySelector('#boot-msg,#loading,#rotate-hint');
    if(boot) overlay=boot.textContent?.slice(0,50);
    return {scenes, version:g?window.__VERSION:null, overlayText:document.body.innerText?.slice(0,120)||'', bodyBg:getComputedStyle(document.body).backgroundColor};
  });
  const info=(loadMs+(i+1)*1000)/1000;
  console.log('t+'+info.toFixed(1)+'s', JSON.stringify(snap), f.split('/').pop());
  last=f;
}
console.log('ERRS', JSON.stringify(errs));
await b.close();
