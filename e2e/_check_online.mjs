import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport:{width:1280,height:720} });
const errs=[];
page.on('pageerror',e=>errs.push('PAGE:'+e.message.slice(0,300)));
page.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE:'+m.text().slice(0,300)); });
page.on('requestfailed',r=>errs.push('REQFAIL:'+r.url().slice(0,200)+' :: '+r.failure()?.errorText));
const navT=Date.now();
await page.goto('https://251126-com.github.io/maidfish-survivor/', {waitUntil:'load', timeout:90000});
await page.waitForTimeout(4000);
const info = await page.evaluate(()=>{
  const g=window.__game; const s=document.querySelector('#game canvas'); const js=document.querySelectorAll('script');
  return {
    version:window.__VERSION, hasGame:!!g, booted:g?.isBooted, loop:g?.loop?.running,
    renderer: g?.renderer?.type===3?'WebGL':'Canvas',
    scenes: g?.scene?.scenes?.map(x=>x.scene.key+':'+x.sys.isActive()).join(','),
    canvas: s?{w:s.width,h:s.height,cw:s.clientWidth,ch:s.clientHeight}:null,
    bgColor: getComputedStyle(document.body).backgroundColor,
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
    readyState: document.readyState,
    scriptSrc: Array.from(js).filter(j=>j.src).map(j=>j.src.split('/').slice(-2).join('/'))
  };
});
await page.screenshot({path:'e2e/shots/experience-review/online/check_online_now.png', fullPage:false});
console.log('NAVMS', Date.now()-navT);
console.log('INFO', JSON.stringify(info,null,1));
console.log('ERRS', JSON.stringify(errs));
await b.close();
