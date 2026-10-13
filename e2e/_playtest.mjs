// 通用真实试玩：E2E_URL 目标，输出到 e2e/shots/experience-review/<label>
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.env.E2E_URL;
const LABEL = process.env.E2E_LABEL || 'playtest';
const OUT = `/AstrBot/data/workspaces/snowluma_FriendMessage_2010368297/maidfish-survivor/e2e/shots/experience-review/${LABEL}`;
fs.mkdirSync(OUT,{recursive:true});
const b = await chromium.launch({ executablePath:'/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport:{width:1280,height:720}, recordVideo:{dir:OUT, size:{width:1280,height:720}} });
const page = await ctx.newPage();
const errs=[];
page.on('pageerror',e=>errs.push('PAGE:'+e.message.slice(0,200)));
page.on('console',m=>{ if(m.type()==='error'&&!/favicon|404/.test(m.text())) errs.push('CONSOLE:'+m.text().slice(0,200)); });
const start=Date.now();
const navT=Date.now();
await page.goto(URL, {waitUntil:'load', timeout:90000});
const loadMs=Date.now()-navT;
// 轮询等 Boot 完成进入菜单（最长20s）
let menuMs=-1, ver=null, rtype=null;
for(let i=0;i<40;i++){
  await page.waitForTimeout(500);
  const st=await page.evaluate(()=>{try{const g=window.__game;return {m:g.scene.getScene('Menu').sys.isActive(), v:window.__VERSION, r:g.renderer?.type};}catch{return {m:false,v:null,r:null};}});
  if(ver===null&&st.v)ver=st.v;
  if(rtype===null&&st.r!==null)rtype=st.r;
  if(st.m){menuMs=Date.now()-navT;break;}
}
await page.screenshot({path:`${OUT}/01_menu.png`});
console.log(`[${LABEL}] LOAD_MS=${loadMs} MENU_MS=${menuMs} VER=${ver} RENDERER_TYPE=${rtype} (1=Canvas,2=WebGL,3=Headless)`);
const t1=Date.now();
// 开始：菜单中央开始按钮
await page.mouse.click(640,220);
let gameMs=-1;
for(let i=0;i<20;i++){
  const st=await page.evaluate(()=>{try{return window.__game.scene.getScene('Game').sys.isActive();}catch{return false;}});
  if(st){gameMs=Date.now()-t1;break;} await page.waitForTimeout(500);
}
await page.screenshot({path:`${OUT}/02_start.png`});
console.log(`[${LABEL}] GAME_ACTIVE_MS=${gameMs}`);
const snap=()=>page.evaluate(()=>{try{const g=window.__game,s=g.scene.getScene('Game');return {elapsed:+s.elapsed?.toFixed(1),fps:Math.round(g.loop.actualFps??0),px:Math.round(s.player.x),py:Math.round(s.player.y),hp:Math.round(s.player.stats.hp),armor:s.player.armor?.armor??0,kills:s.kills,enemies:s.enemies?.count,bullets:s.weapons?.bulletCount,level:s.levelSys?.level,xp:Math.round(s.levelSys?.xp??0),gold:s.gold,drops:s.drops?.count,boss:s.bossEnemy?{hp:Math.round(s.bossEnemy.hp),st:s.bossBrain?.state}:null};}catch(e){return {err:String(e).slice(0,120)};}});
// 移动+自动开火：右下画圈
const move=async(ks,d)=>{for(const k of ks)await page.keyboard.down(k);await page.waitForTimeout(d);for(const k of ks)await page.keyboard.up(k);};
await move(['d'],1500); await page.screenshot({path:`${OUT}/03_move_right.png`});
await move(['s'],1200); await page.screenshot({path:`${OUT}/04_move_down.png`});
await move(['a','w'],1500); await page.screenshot({path:`${OUT}/05_circle.png`});
let f=await snap(); console.log(`[${LABEL}] T+${((Date.now()-start)/1000).toFixed(1)}s`,JSON.stringify(f));
// 观察战斗8s
await page.waitForTimeout(8000);
await page.screenshot({path:`${OUT}/06_fight.png`});
f=await snap(); console.log(`[${LABEL}] T+${((Date.now()-start)/1000).toFixed(1)}s`,JSON.stringify(f));
// 等升级面板
let panel=false;
for(let i=0;i<40;i++){ const p=await page.evaluate(()=>{try{return !!window.__game.scene.getScene('Game').panel?.visible;}catch{return false;}}); if(p){panel=true;break;} await page.waitForTimeout(500); }
await page.screenshot({path:`${OUT}/07_levelup.png`});
console.log(`[${LABEL}] LEVELUP_PANEL=${panel} T+${((Date.now()-start)/1000).toFixed(1)}s`);
f=await snap(); console.log(`[${LABEL}] T+${((Date.now()-start)/1000).toFixed(1)}s`,JSON.stringify(f));
console.log(`[${LABEL}] ERRS=${JSON.stringify(errs)}`);
console.log(`[${LABEL}] VIDEO=${page.video()?.path()}`);
await b.close();
