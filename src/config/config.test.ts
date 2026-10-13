// 数值配置测试：经验曲线单调、刷怪时间轴选段正确、权重选取不越界
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xpNeed, hpScale, speedScale, POOL_LIMIT, BOSS_TIME, BOSS_WARN_TIME, STARTER_ARMOR, ARMOR_MAX } from './balance.ts';
import { currentPhase, pickEnemy, SPAWN_TIMELINE, WAVE_EVENTS } from './timeline.ts';
import { WEAPONS, OBTAINABLE_WEAPONS } from './weapons.ts';
import { ENEMIES } from './enemies.ts';

test('经验曲线随等级严格递增', () => {
  for (let lv = 1; lv < 20; lv++) {
    assert.ok(xpNeed(lv + 1) > xpNeed(lv), `lv${lv}->${lv + 1} 必须递增`);
  }
});

test('v0.10: 首次升级门槛下调（1级仅需 ~14 经验，配合开局波次 20s 内升级）', () => {
  assert.ok(xpNeed(1) <= 17, `首次升级门槛应足够低，当前 ${xpNeed(1)}`);
  assert.ok(xpNeed(2) <= 34, `2级门槛 ${xpNeed(2)} 应低于旧版 33~35`);
});

test('v0.10: Boss 提前到 150s（玩家一局必然见到，且有预警提前量）', () => {
  assert.equal(BOSS_TIME, 150, 'Boss 应提前到 150s');
  assert.ok(BOSS_TIME < 600, '不应再是 600s 的远未来 Boss');
  assert.ok(BOSS_WARN_TIME > 0 && BOSS_WARN_TIME < BOSS_TIME, 'Boss 预警提前量需在 (0, BOSS_TIME) 区间内');
});

test('v0.10: 开局波次事件升序、0s 即有、半径小（进屏快）、敌人 id 合法', () => {
  assert.equal(WAVE_EVENTS[0].atSec, 0, '开局立即有一波');
  let prev = -1;
  for (const ev of WAVE_EVENTS) {
    assert.ok(ev.atSec > prev, '波次时间必须严格升序');
    prev = ev.atSec;
    assert.ok(ev.radius < 700, `波次生成半径 ${ev.radius} 应小于常规 760~980，保证 10s 内进屏`);
    assert.ok(ev.label.length > 0, '波次要有横幅文案');
    for (const [id, n] of ev.burst) {
      assert.ok(ENEMIES[id], `波次敌人 ${id} 必须在敌人表里`);
      assert.ok(n > 0, '波次数量必须为正');
    }
  }
});

test('v0.10: 前 60s 刷怪节奏变密（间隔从 1100ms 提速），但 0s 阶段不刷屏', () => {
  assert.equal(SPAWN_TIMELINE[0].fromSec, 0);
  assert.equal(SPAWN_TIMELINE[0].intervalMs, 1100, '开局 1100ms/只，可感知但可读');
  const t60 = currentPhase(59).fromSec;
  assert.ok(t60 <= 60, `60s 时应已进入更密阶段，当前 ${t60}s`);
  assert.ok(currentPhase(59).intervalMs < 800, `60s 附近间隔应已提速，当前 ${currentPhase(59).intervalMs}ms`);
});

test('v0.10 finetune: 前60s同屏上限收紧，30s 前后不再被 40+ 敌群淹没', () => {
  const early = SPAWN_TIMELINE.filter(p => p.fromSec < 60);
  for (const p_ of early) {
    assert.ok(p_.maxAlive <= 90, `前60s阶段 ${p_.fromSec}s maxAlive=${p_.maxAlive} 应≤90`);
  }
  assert.ok(SPAWN_TIMELINE[0].maxAlive < 18, '开局同屏上限应低于 v0.10.0 初版的 18');
  // 第2/3波不应再瞬间灌入疾行鱼（dart 移速 170，太早入场不公平）
  const w2 = WAVE_EVENTS.find(w => w.atSec === 24);
  const w3 = WAVE_EVENTS.find(w => w.atSec === 42);
  assert.ok(w2 && w2.burst.find(b => b[0] === 'dart')?.[1] === 1, '24s 波 dart 应压到 1 只');
  assert.ok(w3 && w3.burst.find(b => b[0] === 'dart')?.[1] === 2, '42s 波 dart 应压到 2 只');
});

test('v0.10 finetune: 开局自带半份饭盆护盾（20/30），拾取仍可补满', () => {
  assert.ok(STARTER_ARMOR > 0 && STARTER_ARMOR < ARMOR_MAX,
    `开局护盾 ${STARTER_ARMOR} 应在 (0, ${ARMOR_MAX}) 区间`);
});

test('敌人成长曲线随时间递增且有上限', () => {
  assert.ok(hpScale(600) > hpScale(0));
  assert.ok(speedScale(600) > speedScale(0));
  assert.ok(speedScale(99999) <= 1.5, '移速加成必须有封顶');
});

test('currentPhase 按时间取到正确阶段', () => {
  assert.equal(currentPhase(0).fromSec, 0);
  assert.equal(currentPhase(100).fromSec, 60);
  assert.equal(currentPhase(9999).fromSec, SPAWN_TIMELINE[SPAWN_TIMELINE.length - 1].fromSec);
});

test('pickEnemy 只返回该阶段权重内的敌人 id', () => {
  for (const phase of SPAWN_TIMELINE) {
    const allowed = new Set(phase.weights.map(w => w[0]));
    for (let i = 0; i < 200; i++) {
      const id = pickEnemy(phase);
      assert.ok(allowed.has(id), `${id} 不在阶段 ${phase.fromSec}s 的权重表里`);
      assert.ok(ENEMIES[id], `${id} 必须在敌人表里存在`);
    }
  }
});

test('武器等级表长度与 maxLevel 一致，且数值不倒退', () => {
  for (const w of Object.values(WEAPONS)) {
    assert.equal(w.levels.length, w.maxLevel, `${w.id} 等级表长度不符`);
    for (let i = 1; i < w.levels.length; i++) {
      assert.ok(w.levels[i].damage >= w.levels[i - 1].damage, `${w.id} 伤害不应倒退`);
      assert.ok(w.levels[i].cooldown <= w.levels[i - 1].cooldown, `${w.id} 冷却不应变长`);
    }
  }
});

test('武器进化配方指向已存在的被动', () => {
  const passiveIds = new Set(['scope', 'maidband']);
  for (const w of Object.values(WEAPONS)) {
    if (w.evolution) assert.ok(passiveIds.has(w.evolution.requiredPassive), `${w.id} 进化钥匙不存在`);
  }
});

test('池上限为正整数', () => {
  for (const [k, v] of Object.entries(POOL_LIMIT)) {
    assert.ok(Number.isInteger(v) && v > 0, `${k} 上限非法`);
  }
});

// ---------- v0.11.0 新增内容：深海小怪 / 霰弹枪 / 经验提速 ----------

test('v0.11: 新增水母与灯笼鱼，各自有独立移动模式与行为配置', () => {
  const jelly = ENEMIES['jelly'];
  const lantern = ENEMIES['lantern'];
  assert.ok(jelly, '水母必须在敌人表');
  assert.ok(lantern, '灯笼鱼必须在敌人表');
  assert.equal(jelly.move, 'float', '水母应是漂浮移动');
  assert.ok(jelly.aura && jelly.aura.interval > 0 && jelly.aura.telegraph > 0 && jelly.aura.radius > 0,
    '水母必须有麻痹圈参数');
  assert.equal(lantern.move, 'dash', '灯笼鱼应是冲刺移动');
  assert.ok(lantern.dash && lantern.dash.cd > 0 && lantern.dash.dur > 0 && lantern.dash.speed > 0,
    '灯笼鱼必须有冲刺参数');
  assert.ok(jelly.xp > 0 && lantern.xp > 0, '新敌人击杀应有经验');
});

test('v0.11: 霰弹枪进升级池（可获取武器且非进化），数值不倒退', () => {
  const sg = WEAPONS['shotgun'];
  assert.ok(sg, '霰弹枪必须在武器表');
  assert.ok(OBTAINABLE_WEAPONS.includes(sg) || OBTAINABLE_WEAPONS.some(w => w.id === 'shotgun'),
    '霰弹枪必须是可获取武器（非进化）');
  assert.equal(sg.levels.length, sg.maxLevel);
  for (let i = 1; i < sg.levels.length; i++) {
    assert.ok(sg.levels[i].damage >= sg.levels[i - 1].damage, '霰弹枪伤害不应倒退');
    assert.ok(sg.levels[i].cooldown <= sg.levels[i - 1].cooldown, '霰弹枪冷却不应变长');
  }
  assert.ok(sg.levels[0].count >= 5, '霰弹枪应多弹丸（扇形）');
  assert.ok(sg.levels[0].spread && sg.levels[0].spread > 0.14, '霰弹枪扇形间隔应大于默认步枪');
  assert.ok(sg.levels[0].life && sg.levels[0].life < 1, '霰弹枪应有短寿命=短射程');
});

test('v0.11: 首次升级门槛降到 ~13（开局 15~20s 内升级）', () => {
  assert.ok(xpNeed(1) <= 14, `首次升级门槛 ${xpNeed(1)} 应≤14`);
});
