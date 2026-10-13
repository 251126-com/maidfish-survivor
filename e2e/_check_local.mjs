import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport:{width:1280,height:720} });
const errs=[];
page.on('pageerror',e=>errs.push('PAGE:'+e.message.slice(0,300)));
page.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE:'+m.text().slice(0,300)); });
await page.goto('http://127.0.0.1:4173/', {waitUntil:'load', timeout:60000});
await page.waitForTimeout(3000);
const info = await page.evaluate(()=>{
  const g=window.__game; const s=document.querySelector('#game canvas');
  return {
    version:window.__VERSION, hasGame:!!g, booted:g?.isBooted, loop:g?.loop?.running,
    renderer: g?.renderer?.type===3?'WebGL':'Canvas',
    scenes: g?.scene?.scenes?.map(x=>x.scene.key+':'+x.sys.isActive()).join(','),
    canvas: s?{w:s.width,h:s.height,cw:s.clientWidth,ch:s.clientHeight}:null,
    gameEl: !!document.getElementById('game')
  };
});
await page.screenshot({path:'/tmp/check_local.png'});
console.log('INFO', JSON.stringify(info,null,1));
console.log('ERRS', JSON.stringify(errs));
await b.close();
