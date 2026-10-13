import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport:{width:1280,height:720} });
await page.goto('http://127.0.0.1:4173/', {waitUntil:'load'});
await page.waitForTimeout(1000);
await page.evaluate(()=>{
  localStorage.setItem('maidfish-survivor-save-v1',
    '{"gold":1e309,"meta":{"meta_atk":99999,"meta_hp":-4,"meta_spd":2.9},"best":{"time":-10,"kills":5,"level":1e308}}');
});
await page.reload({waitUntil:'load'});
await page.waitForTimeout(1800);
const r = await page.evaluate(()=>{
  const m = window.__game.scene.getScene('Menu');
  const texts = [];
  for (const o of m.children.list) {
    if (o.type === 'Text' && typeof o.text === 'string') texts.push(o.text);
  }
  return { goldText: texts.find(t=>t.startsWith('金币')), bestText: texts.find(t=>t.startsWith('最佳')),
           upgrades: texts.filter(t=>/Lv\./.test(t)).slice(0,6), all: texts.filter(t=>t.includes('强化')||t.includes('训练')) };
});
console.log('B6 probe:', JSON.stringify(r));
await b.close();
