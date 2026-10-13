import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport:{width:1280,height:720} });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://127.0.0.1:4173/', {waitUntil:'load'});
await page.waitForTimeout(1200);
await page.mouse.click(640,230);
await page.waitForTimeout(1200);
const r = await page.evaluate(()=>{
  const s = window.__game.scene.getScene('Game');
  s.spawnTimer=99999; s.player.stats.hp=9999; s.player.stats.maxHp=9999; s.player.invuln=0;
  s.paused = true; s.elapsed = 600; s.bossSpawned = false;
  s.updateSpawner(0.016);
  const br = s.bossBrain, be = s.bossEnemy, p = s.player;
  const ratio = be.hp/be.maxHp;
  const snap = tag => ({tag, state: br.state, stateT:+br.stateT.toFixed(3), skill: br.skill, phase: br.phase, inAct: br.inAct});
  const out = [snap('after-spawn')];
  // B4 replica
  br.pickSkill = () => 'circle';
  br.state = 'idle'; br.stateT = 0;
  let tep = null;
  const b4log = [];
  for (let i = 0; i < 30 && !tep; i++) {
    const evs = br.step(0.6, ratio, p.x, p.y);
    b4log.push({i, evs: evs.map(e=>e.type+':'+e.skill), ...snap('')});
    tep = evs.find(e => e.type === 'telegraph-start');
  }
  out.push({...snap('after-b4'), b4log});
  // B3 replica
  let ev2 = [];
  const ev2log = [];
  for (let i = 0; i < 20 && !br.inAct; i++) { ev2.push(...br.step(0.2, ratio, p.x, p.y)); ev2log.push({i, ...snap('')}); }
  out.push({...snap('after-ev2'), ev2Events: ev2.map(e=>e.type+':'+e.skill)});
  be.hp = 0.3 * be.maxHp;
  const ev3 = br.step(0.05, 0.3, p.x, p.y);
  out.push({...snap('after-ev3'), ev3: ev3.map(e=>({t:e.type,s:e.skill}))});
  return out;
});
console.log(JSON.stringify(r, null, 1));
console.log('ERR', JSON.stringify(errs));
await b.close();
