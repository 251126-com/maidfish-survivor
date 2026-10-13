import { chromium } from 'playwright';
const URL=process.env.E2E_URL||'http://127.0.0.1:4174/';
const exec=process.env.EXEC||'/usr/bin/chromium';
const W=parseInt(process.env.W||'1280'),H=parseInt(process.env.H||'720');
const b=await chromium.launch({executablePath:exec,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage({viewport:{width:W,height:H}});
await p.goto(URL,{waitUntil:'load',timeout:90000});
for(let i=0;i<30;i++){const m=await p.evaluate(()=>{try{return window.__game.scene.getScene('Menu').sys.isActive();}catch{return false;}});if(m)break;await p.waitForTimeout(400);}
await p.mouse.click(Math.floor(W/2),Math.floor(H*0.3));
await p.waitForTimeout(1000);
let e0=0;
for(let i=0;i<20;i++){const s=await p.evaluate(()=>{try{const g=window.__game,s=g.scene.getScene('Game');return {e:+s.elapsed?.toFixed(2),f:Math.round(g.loop.actualFps??0)};}catch{return {e:0,f:0};}});if(i===0)e0=s.e;if(i===19){console.log('VIEW',W+'x'+H,'EXEC',exec.split('/').pop(),'fps',s.f,'elapsed_delta',(s.e-e0).toFixed(2),'speed_x',((s.e-e0)/20).toFixed(3));}await p.waitForTimeout(1000);}
await b.close();
