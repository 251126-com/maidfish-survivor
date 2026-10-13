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
fs.mkdirSync('/AstrBot/data/workspaces/snowluma_FriendMessage_2010368297/maidfish-survivor/e2e/shots/experience-review/online',{recursive:true});
for (let i=0;i<10;i++){
  await page.waitForTimeout(1000);
  const px = await page.evaluate(()=>{
    const c=document.querySelector('#game canvas'); if(!c) return {noCanvas:true};
    const ctx=c.getContext('2d');
    // sample grid 8x5
    const W=c.width,H=c.height; const colors=[];
    for(let gy=0;gy<5;gy++) for(let gx=0;gx<8;gx++){
      const d=ctx.getImageData(Math.floor(gx*W/8),Math.floor(gy*H/5),1,1).data;
      colors.push([d[0],d[1],d[2]]);
    }
    const avg=[0,0,0]; for(const c2 of colors){avg[0]+=c2[0];avg[1]+=c2[1];avg[2]+=c2[2];}
    avg[0]/=colors.length;avg[1]/=colors.length;avg[2]/=colors.length;
    const uniq=new Set(colors.map(c=>c.join(','))).size;
    return {avg:avg.map(Math.round), uniq, W,H, canvasCount:document.querySelectorAll('#game canvas').length, bodyText:(document.body.innerText||'').slice(0,200)};
  });
  await page.screenshot({path:`/AstrBot/data/workspaces/snowluma_FriendMessage_2010368297/maidfish-survivor/e2e/shots/experience-review/online/px_${String(i).padStart(2,'0')}_t${(loadMs+ (i+1)*1000)/1000}s.png`});
  const scenes = await page.evaluate(()=>{ const g=window.__game; return g? g.scene.scenes.map(x=>x.scene.key+':'+x.sys.isActive()+':'+(x.sys.isSleeping()?'Z':'')).join(',') : 'no-game'; });
  console.log('t+'+((loadMs+(i+1)*1000)/1000).toFixed(1)+'s', JSON.stringify(px), 'scenes='+scenes);
}
console.log('ERRS', JSON.stringify(errs));
await b.close();
