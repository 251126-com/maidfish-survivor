import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args:['--no-sandbox','--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport:{width:1280,height:720} });
await page.goto('http://127.0.0.1:4173/', {waitUntil:'load'});
await page.waitForTimeout(1500);
await page.mouse.click(640,230);
await page.waitForTimeout(1500);

const d = await page.evaluate(()=>{
  const g = window.__game;
  const s = g.scene.getScene('Game');
  let raf=0, rafStart=0;
  const tick=(t)=>{raf++; if(!rafStart) rafStart=t; if(raf<600) requestAnimationFrame(tick);};
  requestAnimationFrame(tick);
  window.__DC2='not';
  s.time.delayedCall(300, ()=>{ window.__DC2='fired'; });
  const clockNow0 = s.time.now;
  const loopTime0 = g.loop.time;
  const elapsed0 = s.elapsed;
  return {sceneStatus:s.sys.settings.status, vis:document.visibilityState, clockNow0, loopTime0, elapsed0};
});
await page.waitForTimeout(3000);
const d2 = await page.evaluate(()=>{
  const g = window.__game;
  const s = g.scene.getScene('Game');
  return { raf: window.__rafCount, dc2: window.__DC2, clockNow: s.time.now, loopTime: g.loop.time, elapsed: s.elapsed,
           activeTimers: s.time._active?.length??null, pendingIns: s.time._pendingInsertion?.length??null,
           stepRunning: g.loop.running, actualFps: g.loop.actualFps, smoothStep: g.loop.smoothStep,
           inFocus: g.loop.inFocus, coolDown: g.loop._coolDown };
});
console.log('T0', JSON.stringify(d));
console.log('T3s', JSON.stringify(d2));
await b.close();
