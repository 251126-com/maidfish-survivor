// 最小可重复复核：采样更稳，仅覆盖用户要求的验收面
import { chromium } from 'playwright';

const URL = process.env.E2E_URL || 'http://127.0.0.1:4173/';
const errors = [];
const isNoise = t => /favicon|404 \(Not Found\)/.test(t);
const res = [];
const check = (n, ok, d='') => { res.push([n, !!ok, d]); console.log(`${ok?'✔':'✘'} ${n}${d?'  ['+d+']':''}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args:['--no-sandbox','--disable-dev-shm-usage'] });

// ---------- 桌面 ----------
const page = await browser.newPage({ viewport:{width:1280,height:720} });
page.on('pageerror', e=>errors.push('pageerror: '+e.message));
page.on('console', m=>{ if(m.type()==='error'&&!isNoise(m.text())) errors.push('console: '+m.text()); });
await page.goto(URL,{waitUntil:'load'});
await page.waitForTimeout(1600);
check('D1 版本标记 __VERSION=0.8.0', (await page.evaluate(()=>window.__VERSION))==='0.8.0');
await page.mouse.click(640,230);
await page.waitForTimeout(1800);
const asset = await page.evaluate(()=>{const s=window.__game.scene.getScene('Game');const i=s.player.sprite;return{key:i.texture.key,w:i.texture.source[0].width,h:i.texture.source[0].height};});
check('D2 角色素材 player_whale 308x320', asset.key==='player_whale'&&asset.w===308&&asset.h===320, JSON.stringify(asset));
const hud = await page.evaluate(()=>{const s=window.__game.scene.getScene('Game');const h=s.hud;return{hp:h.hpText.text,xp:h.xpText.text,info:h.infoText.text,time:h.timeText.text,w:h.weaponText.text};});
check('D3 HUD 血条/XP/等级/计时/武器', /^\d+ \/ \d+$/.test(hud.hp)&&/^经验 \d+ \/ \d+$/.test(hud.xp)&&/Lv\.\d+\n击杀 \d+\n金币 \d+/.test(hud.info)&&/^\d{2}:\d{2}$/.test(hud.time)&&/制式步枪 Lv\.1/.test(hud.w), JSON.stringify(hud));
await page.evaluate(()=>{const s=window.__game.scene.getScene('Game');s.spawnTimer=99999;});
const bobSamples=[];
const cds = await page.context().newCDPSession(page);
const cb = await page.locator('canvas').first().boundingBox();
const lx=(x)=>cb.x+x/1280*cb.width, ly=(y)=>cb.y+y/720*cb.height;
await cds.send('Input.dispatchMouseEvent',{type:'mousePressed',x:lx(640),y:ly(420),button:'left',clickCount:1});
await cds.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:lx(900),y:ly(420),button:'left',buttons:1});
for(let i=0;i<8;i++){await page.waitForTimeout(50);bobSamples.push(await page.evaluate(()=>{const s=window.__game.scene.getScene('Game');return s.player.sprite.y-s.player.y;}));}
await cds.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:lx(900),y:ly(420),button:'left',clickCount:1});
const bobRange=Math.max(...bobSamples)-Math.min(...bobSamples);
check('D4 真实输入拖动触发移动 bob', bobRange>1, `range=${bobRange.toFixed(2)}px samples=[${bobSamples.join(',')}]`);
const sq = await page.evaluate(()=>{const s=window.__game.scene.getScene('Game');s.player.takeDamage(1);s.player.update(0.016,0,0);const r={x:+s.player.sprite.scaleX.toFixed(3),y:+s.player.sprite.scaleY.toFixed(3),knock:+s.player.hitKnockX.toFixed(2)};s.player.stats.hp=9999;return r;});
check('D5 受击挤压+后仰', sq.x>sq.y&&Math.abs(sq.knock)>=14, JSON.stringify(sq));
const rc = await page.evaluate(()=>{const s=window.__game.scene.getScene('Game');s.player.hitKnockX=0;s.player.recoilX=0;s.player.update(0.016,0,0);s.player.onFire();s.player.update(0.001,0,0);return{sx:+s.player.sprite.x.toFixed(2),px:+s.player.x.toFixed(2),recoilX:+s.player.recoilX.toFixed(2)};});
check('D6 开火后坐', Math.abs((rc.sx-rc.px)+4)<0.5&&rc.recoilX<0, JSON.stringify(rc));
await page.mouse.click(1218,126); await page.waitForTimeout(250);
const pa=await page.evaluate(()=>{const s=window.__game.scene.getScene('Game');return{p:s.paused,e:s.elapsed,v:s.pauseOverlay.visible};});
await page.waitForTimeout(1000);
const pb=await page.evaluate(()=>{const s=window.__game.scene.getScene('Game');return{p:s.paused,e:s.elapsed};});
check('D7 暂停冻结', pa.p===true&&pa.v===true&&Math.abs(pb.e-pa.e)<0.01, `${pa.e.toFixed(3)}→${pb.e.toFixed(3)}`);
await page.mouse.click(1218,126); await page.waitForTimeout(500);
const pc=await page.evaluate(()=>window.__game.scene.getScene('Game').paused);
check('D8 恢复', pc===false);
await page.close();

// ---------- 手机 ----------
const ctx = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const mp = await ctx.newPage();
mp.on('pageerror',e=>errors.push('mpageerror: '+e.message));
const client = await ctx.newCDPSession(mp);
const mpB = await mp.locator('canvas').first().boundingBox();
const map=async(lx,ly)=>({x:mpB.x+lx/1280*mpB.width,y:mpB.y+ly/720*mpB.height});
const touch=(type,pts)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
await mp.goto(URL,{waitUntil:'load'}); await mp.waitForTimeout(1700);
const fit=await mp.locator('canvas').first().boundingBox();
check('M1 手机 FIT 画布', Math.abs(fit.width/fit.height-1280/720)<0.02&&fit.width<=390&&fit.height<=844, `${fit.width.toFixed(0)}x${fit.height.toFixed(0)}`);
let p=await map(640,230); await touch('touchStart',[{x:p.x,y:p.y,id:1,radiusX:2,radiusY:2,force:1}]); await page?null:null; await touch('touchEnd',[]); await mp.waitForTimeout(1300);
const st=await mp.evaluate(()=>{const s=window.__game.scene.getScene('Game');if(!s)return null;return{e:s.elapsed,en:s.enemies.count,bu:s.weapons.bulletCount};});
check('M2 触摸开始进入战斗', st&&st.e>0&&st.en>0, JSON.stringify(st));
// 水平拖拽 → dirX 近-1
const a=await map(640,420), b=await map(340,420);
await touch('touchStart',[{x:a.x,y:a.y,id:1,radiusX:2,radiusY:2,force:1}]); await mp.waitForTimeout(50);
for(let i=1;i<=8;i++){await touch('touchMove',[{x:a.x+(b.x-a.x)*i/8,y:a.y,id:1,radiusX:2,radiusY:2,force:1}]);await mp.waitForTimeout(25);}
await mp.waitForTimeout(200);
const joy=await mp.evaluate(()=>{const s=window.__game.scene.getScene('Game');return s.inputSys.joystick;});
const mv=await mp.evaluate(()=>{const s=window.__game.scene.getScene('Game');bobSamples.length;return{px:s.player.x,py:s.player.y};});
await touch('touchEnd',[]);
check('M3 摇杆满速水平 + 拖动移动', joy.active&&joy.magnitude>0.9&&joy.dirX<-0.9, JSON.stringify(joy));
// 子弹窗口采样
let bullets=0; for(let i=0;i<12;i++){await mp.waitForTimeout(60);const c=await mp.evaluate(()=>{const s=window.__game.scene.getScene('Game');return s.weapons.bulletCount;});if(c>0){bullets=c;break;}}
check('M4 窗口内自动开火有子弹', bullets>0, `bulletCount=${bullets}`);
await mp.close();

check('E 无运行错误', errors.length===0, errors.join('; ').slice(0,200));
console.log(`\n===== 汇总: ${res.filter(r=>r[1]).length}/${res.length} 通过 =====`);
await browser.close();
process.exit(res.every(r=>r[1])?0:1);
