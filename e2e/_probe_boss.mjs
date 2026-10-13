import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport:{width:1280,height:720} });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://127.0.0.1:4173/', {waitUntil:'load'});
await page.waitForTimeout(1200);
await page.mouse.click(640,230);
await page.waitForTimeout(1200);
// setup
const st = await page.evaluate(()=>{
  const s = window.__game.scene.getScene('Game');
  s.spawnTimer=99999; s.player.stats.hp=9999; s.player.stats.maxHp=9999; s.player.invuln=0;
  return 'setup ok';
});
console.log('setup:', st);
// spawn boss
const boss = await page.evaluate(()=>{
  const s = window.__game.scene.getScene('Game');
  s.paused = true; s.elapsed = 600; s.bossSpawned = false;
  s.updateSpawner(0.016);
  return { has: !!s.bossBrain, state: s.bossBrain?.state, skill: s.bossBrain?.skill, phase: s.bossBrain?.phase,
           beX: s.bossEnemy?.x, beY: s.bossEnemy?.y, hpRatio: s.bossEnemy ? s.bossEnemy.hp/s.bossEnemy.maxHp : null };
});
console.log('boss spawn:', JSON.stringify(boss));
// B4 sequence with log
const b4 = await page.evaluate(()=>{
  const s = window.__game.scene.getScene('Game');
  const br = s.bossBrain, be = s.bossEnemy, p = s.player;
  const ratio = be.hp/be.maxHp;
  br.pickSkill = () => 'circle';
  br.state = 'idle'; br.stateT = 0;
  const log = [];
  for (let i=0;i<30;i++){
    const evs = br.step(0.6, ratio, p.x, p.y);
    const tep = evs.find(e=>e.type==='telegraph-start');
    log.push({i, ev: evs.map(e=>e.type).join(','), state: br.state, stateT: br.stateT, skill: br.skill, inAct: br.inAct});
    if (tep) break;
  }
  return { log, state: br.state, stateT: br.stateT, skill: br.skill, lastTelegraph: !!br.lastTelegraphParams };
});
console.log('B4 log:', JSON.stringify(b4));
// B3 sequence
const b3 = await page.evaluate(()=>{
  const s = window.__game.scene.getScene('Game');
  const br = s.bossBrain, be = s.bossEnemy, p = s.player;
  const ratio = be.hp/be.maxHp;
  const log=[];
  for (let i=0;i<20 && !br.inAct;i++){
    const evs = br.step(0.2, ratio, p.x, p.y);
    log.push({i, ev: evs.map(e=>e.type).join(','), state: br.state, stateT: +br.stateT.toFixed(3), skill: br.skill, inAct: br.inAct});
  }
  return { inAct: br.inAct, state: br.state, skill: br.skill, stateT: +br.stateT.toFixed(3), log };
});
console.log('B3 log tail:', JSON.stringify(b3.log.slice(-6)));
// cancel step
const cancel = await page.evaluate(()=>{
  const s = window.__game.scene.getScene('Game');
  const br = s.bossBrain, be = s.bossEnemy, p = s.player;
  be.hp = 0.3*be.maxHp;
  const evs = br.step(0.05, 0.3, p.x, p.y);
  return { evs: evs.map(e=>({type:e.type, skill:e.skill, phase:e.phase})), state: br.state, skill: br.skill, phase: br.phase };
});
console.log('cancel:', JSON.stringify(cancel));
console.log('ERR', JSON.stringify(errs));
await b.close();
