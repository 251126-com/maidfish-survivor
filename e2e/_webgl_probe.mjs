import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport:{width:1280,height:720} });
await page.goto('http://127.0.0.1:4173/', {waitUntil:'load', timeout:60000});
await page.waitForTimeout(1500);
const info = await page.evaluate(()=>{
  const g=window.__game;
  const canvas = document.querySelector('#game canvas');
  // 尝试建 WebGL context
  let webglOk=false, webglErr='';
  try { const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl'); webglOk=!!gl; } catch(e){ webglErr=String(e); }
  return { rendererType: g?.renderer?.type, rendererName: g?.renderer?.type===3?'WebGL':g?.renderer?.type===1?'Canvas':'?', webglOk, webglErr, canvasW: canvas?.width, canvasH: canvas?.height };
});
// 打几秒测 fps
await page.evaluate(()=>{ window.__game.scene.getScene('Menu').scene.start('Game'); });
await page.waitForTimeout(3000);
const fps = await page.evaluate(()=>{
  const g=window.__game; const s=g.scene.getScene('Game');
  return { fps: Math.round(g.loop.actualFps||0), enemies: s.enemies?.count, elapsed: +s.elapsed.toFixed(1) };
});
console.log('INFO', JSON.stringify(info));
console.log('FPS', JSON.stringify(fps));
await b.close();
