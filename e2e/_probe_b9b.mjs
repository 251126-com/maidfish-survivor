import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport:{width:1280,height:720} });
await page.goto('http://127.0.0.1:4173/', {waitUntil:'load'});
await page.waitForTimeout(1200);
const info = () => page.evaluate(()=>{
  const g = window.__game;
  const s = g.scale;
  const cnv = document.querySelector('#game canvas');
  return {
    mode: s.scaleMode, parentSize: `${s.parentSize.width}x${s.parentSize.height}`,
    displaySize: `${s.displaySize.width}x${s.displaySize.height}`,
    canvasStyleW: cnv.style.width, canvasStyleH: cnv.style.height,
    cssMin: s.displaySize?.cssSize ? `${s.displaySize.cssSize.width}x${s.displaySize.cssSize.height}` : 'n/a',
    boundW: +cnv.getBoundingClientRect().width.toFixed(1),
    parentW: document.getElementById('game').clientWidth,
    loopRunning: g.loop.running,
  };
});
console.log('I0', JSON.stringify(await info()));
// manual resize event only
await page.evaluate(()=> window.dispatchEvent(new Event('resize')));
await page.waitForTimeout(500);
console.log('I1 manual-resize', JSON.stringify(await info()));
await page.setViewportSize({width:900,height:600});
await page.waitForTimeout(500);
console.log('I2 after setViewport 900x600', JSON.stringify(await info()));
await page.evaluate(()=> window.dispatchEvent(new Event('resize')));
await page.waitForTimeout(500);
console.log('I3 manual-resize again', JSON.stringify(await info()));
await b.close();
