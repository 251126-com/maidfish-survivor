import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT='/AstrBot/data/workspaces/snowluma_FriendMessage_2010368297/maidfish-survivor/e2e/shots/experience-review/online';
fs.mkdirSync(OUT,{recursive:true});
const b = await chromium.launch({ executablePath:'/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport:{width:1280,height:720}, recordVideo:{dir:OUT, size:{width:1280,height:720}} });
const page = await ctx.newPage();
const errs=[];
page.on('pageerror',e=>errs.push('PAGE:'+e.message.slice(0,200)));
page.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE:'+m.text().slice(0,200)); });
let t0=Date.now();
const navT=Date.now();
await page.goto('https://251126-com.github.io/maidfish-survivor/', {waitUntil:'load', timeout:90000});
const loadMs=Date.now()-navT;
// 轮询等菜单（最多15s）
let menu=false, bootMs=0;
for(let i=0;i<30;i++){
  await page.waitForTimeout(500);
  const st=await page.evaluate(()=>{try{const g=window.__game;return {m:g.scene.getScene('Menu').sys.isActive(), b:g.scene.getScene('Boot').sys.isActive(), v:window.__VERSION};}catch{return {m:false,b:false,v:null};}});
  if(st.m){menu=true;bootMs=Date.now()-navT;break;}
}
await page.screenshot({path:`${OUT}/baseline_menu.png`});
console.log('LOAD_MS',loadMs,'MENU_MS',bootMs,'MENU',menu,'VERSION',await page.evaluate(()=>window.__VERSION));
const t1=Date.now();
// 点击开始（找菜单上“开始”按钮：全屏截图内任意点，先用v0.9.0菜单布局: 菜单中心偏上）
await page.mouse.click(640,220);
await page.waitForTimeout(800);
let game=false;
for(let i=0;i<20;i++){
  const st=await page.evaluate(()=>{try{const g=window.__game;return g.scene.getScene('Game').sys.isActive();}catch{return false;}});
  if(st){game=true;break;} await page.waitForTimeout(500);
}
await page.screenshot({path:`${OUT}/baseline_after_start.png`});
console.log('GAME_STARTED',game,'AFTER_MS',Date.now()-t1);
// 移动+开火
await page.keyboard.down('d'); await page.waitForTimeout(1200); await page.keyboard.up('d');
await page.keyboard.down('w'); await page.waitForTimeout(1200); await page.keyboard.up('w');
await page.screenshot({path:`${OUT}/baseline_fight.png`});
const s1=await page.evaluate(()=>{try{const g=window.__game,s=g.scene.getScene('Game');return {elapsed:+s.elapsed?.toFixed(1), kills:s.kills, enemies:s.enemies?.count, bullets:s.weapons?.bulletCount, hp:+s.player.stats.hp?.toFixed(0), fps:Math.round(g.loop.actualFps??0)};}catch(e){return {err:String(e).slice(0,120)};}});
console.log('FIGHT_SNAP',JSON.stringify(s1));
// 再等8s观察敌群/击杀
await page.waitForTimeout(8000);
const s2=await page.evaluate(()=>{try{const g=window.__game,s=g.scene.getScene('Game');return {elapsed:+s.elapsed?.toFixed(1), kills:s.kills, enemies:s.enemies?.count, level:s.levelSys?.level, xp:Math.round(s.levelSys?.xp??0), gold:s.gold, drops:s.drops?.count, fps:Math.round(g.loop.actualFps??0)};}catch(e){return {err:String(e).slice(0,120)};}});
await page.screenshot({path:`${OUT}/baseline_later.png`});
console.log('LATER_SNAP',JSON.stringify(s2));
console.log('ERRS',JSON.stringify(errs));
console.log('VIDEO',page.video()?.path()??null);
await b.close();
