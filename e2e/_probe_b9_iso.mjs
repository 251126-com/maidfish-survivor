import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage'] });

// ===== A) 当前代码（含 window resize→refresh）=====
const pA = await b.newPage({ viewport:{width:1280,height:720} });
await pA.goto('http://127.0.0.1:4173/', {waitUntil:'load'});
await pA.waitForTimeout(1200);
const snapA = (tag)=>pA.evaluate(t=>{
  const g=window.__game; const cnv=document.querySelector('#game canvas');
  return { t, ps:`${g.scale.parentSize.width}x${g.scale.parentSize.height}`, ds:`${g.scale.displaySize.width}x${g.scale.displaySize.height}`,
           bound:+cnv.getBoundingClientRect().width.toFixed(1) };
},tag);
console.log('A0', JSON.stringify(await snapA('init')));
await pA.setViewportSize({width:900,height:600});
await pA.waitForTimeout(600);
console.log('A1 after resize', JSON.stringify(await snapA('900x600')));
await pA.setViewportSize({width:1280,height:720});
await pA.waitForTimeout(600);
console.log('A2 back', JSON.stringify(await snapA('1280')));
await pA.close();

// ===== B) 移除我们的 window resize 监听（用 init script 屏蔽），只靠 Phaser 自己 =====
const ctxB = await b.newContext({ viewport:{width:1280,height:720} });
const pB = await ctxB.newPage();
await pB.addInitScript(()=>{
  const orig = window.addEventListener.bind(window);
  window.addEventListener = (type, fn, ...rest) => {
    // 屏蔽所有对 window 的 resize 监听（包括 Phaser 的）→ 只剩 Phaser 内部 dirty? 太强。先完全屏蔽看基线
    return orig(type, fn, ...rest);
  };
});
await pB.goto('http://127.0.0.1:4173/', {waitUntil:'load'});
await pB.waitForTimeout(1200);
const snapB = (tag)=>pB.evaluate(t=>{
  const g=window.__game; const cnv=document.querySelector('#game canvas');
  return { t, ps:`${g.scale.parentSize.width}x${g.scale.parentSize.height}`, ds:`${g.scale.displaySize.width}x${g.scale.displaySize.height}`,
           bound:+cnv.getBoundingClientRect().width.toFixed(1) };
},tag);
console.log('B0', JSON.stringify(await snapB('init')));
await pB.setViewportSize({width:900,height:600});
await pB.waitForTimeout(900);
console.log('B1 no-window-resize-listener', JSON.stringify(await snapB('900x600')));
await pB.close();

// ===== C) 显式 getParentBounds + refresh 两次 =====
const pC = await b.newPage({ viewport:{width:1280,height:720} });
await pC.goto('http://127.0.0.1:4173/', {waitUntil:'load'});
await pC.waitForTimeout(1200);
console.log('C0 init', JSON.stringify(await pC.evaluate(()=>{const g=window.__game;const c=document.querySelector('#game canvas');return {ps:`${g.scale.parentSize.width}x${g.scale.parentSize.height}`,ds:`${g.scale.displaySize.width}x${g.scale.displaySize.height}`,b:+c.getBoundingClientRect().width.toFixed(1)}})));
await pC.setViewportSize({width:900,height:600});
await pC.waitForTimeout(300);
// 手动：先 getParentBounds 更新 parentSize，再 refresh
await pC.evaluate(()=>{ window.__g=window.__game; window.__g.scale.getParentBounds(); window.__g.scale.refresh(); });
await pC.waitForTimeout(300);
console.log('C1 manual gpb+refresh', JSON.stringify(await pC.evaluate(()=>{const g=window.__g;const c=document.querySelector('#game canvas');return {ps:`${g.scale.parentSize.width}x${g.scale.parentSize.height}`,ds:`${g.scale.displaySize.width}x${g.scale.displaySize.height}`,b:+c.getBoundingClientRect().width.toFixed(1)}})));
await pC.evaluate(()=>{ window.__g.scale.getParentBounds(); window.__g.scale.refresh(); });
await pC.waitForTimeout(300);
console.log('C2 second gpb+refresh', JSON.stringify(await pC.evaluate(()=>{const g=window.__g;const c=document.querySelector('#game canvas');return {ps:`${g.scale.parentSize.width}x${g.scale.parentSize.height}`,ds:`${g.scale.displaySize.width}x${g.scale.displaySize.height}`,b:+c.getBoundingClientRect().width.toFixed(1)}})));
await pC.close();
await b.close();
