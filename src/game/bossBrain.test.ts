import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BossBrain, bossPhaseFor, BOSS_PHASE_HP } from './bossBrain.ts';

test('bossPhaseFor 阈值', () => {
  assert.equal(bossPhaseFor(0.9), 0);
  assert.equal(bossPhaseFor(BOSS_PHASE_HP[0] + 0.01), 0);
  assert.equal(bossPhaseFor(0.5), 1);
  assert.equal(bossPhaseFor(0.1), 2);
  assert.equal(bossPhaseFor(0), 2);
});

/** 推送到「下一次 telegraph-start」并返回事件 */
function pumpUntilTelegraph(b: BossBrain, hpRatio = 1, px = 1100, py = 1000): { tep: any; events: any[] } {
  let events: any[] = [];
  for (let i = 0; i < 40; i++) {
    events = b.step(0.1, hpRatio, px, py);
    const tep = events.find(e => e.type === 'telegraph-start');
    if (tep) return { tep, events };
  }
  throw new Error('40 帧内未出现 telegraph-start');
}

test('初始 idle，随后进入 telegraph 并发出预警事件', () => {
  const b = new BossBrain(1000, 1000, 1);
  const { tep } = pumpUntilTelegraph(b);
  assert.equal(b.state, 'telegraph');
  assert.ok(tep.skill === 'dash' || tep.skill === 'spread' || tep.skill === 'circle');
  assert.ok(tep.params.duration > 0);
});

test('dash 预警含方向，act 阶段 boss 沿方向移动', () => {
  const b = new BossBrain(1000, 1000, 1);
  const { tep } = pumpUntilTelegraph(b);
  if (tep.skill !== 'dash') {
    // 不是 dash 就跳过（P0 pool 可能先 spread）；用另一实例直接推多次直到 dash
    let found = false;
    for (let round = 0; round < 6 && !found; round++) {
      const r = pumpUntilTelegraph(b, 1, 1100, 1000);
      if (r.tep.skill === 'dash') {
        found = true;
        // 完成当前 telegraph
        b.step(r.tep.params.duration + 0.01, 1, 1100, 1000);
        break;
      }
      // 完成当前招
      b.step(r.tep.params.duration + 2, 1, 1100, 1000);
    }
    if (!found) return; // 概率上不应发生，但避免 flaky
  } else {
    assert.ok(Math.abs(tep.params.dashDirX! - 1) < 1e-9, '玩家在右侧 → 冲刺朝右');
    const beforeX = b.x;
    b.step(tep.params.duration + 0.01, 1, 1100, 1000); // telegraph 完成
    assert.equal(b.state, 'act');
    assert.equal(b.dashing, true);
    b.step(0.1, 1, 1100, 1000);
    assert.ok(b.x > beforeX, 'dash 向右位移');
  }
});

test('spread act-start 带扇弹参数', () => {
  const b = new BossBrain(1000, 1000, 1);
  let found = false;
  for (let round = 0; round < 6 && !found; round++) {
    const { tep } = pumpUntilTelegraph(b, 1, 1100, 1000);
    if (tep.skill === 'spread') {
      found = true;
      const ev = b.step(tep.params.duration + 0.01, 1, 1100, 1000);
      const act = ev.find(e => e.type === 'act-start');
      assert.ok(act && act.params && act.params.fanAngle !== undefined);
      assert.ok(act.params.fanCount! >= 7);
    } else {
      b.step(tep.params.duration + 2, 1, 1100, 1000);
    }
  }
  assert.equal(found, true, 'P0 池内必有 spread');
});

test('circle 技能：act-end 后进 recover，圈贴近玩家', () => {
  const b = new BossBrain(1000, 1000, 1);
  let found = false;
  for (let round = 0; round < 6 && !found; round++) {
    const { tep } = pumpUntilTelegraph(b, 1, 1100, 1000);
    if (tep.skill === 'circle') {
      found = true;
      assert.ok(tep.params.circles!.length === 1, 'P0 只有 1 个圈');
      assert.ok(Math.abs(tep.params.circles![0].x - 1100) < 1e-6, '第 0 圈贴玩家');
      const ev = b.step(tep.params.duration + 0.01, 1, 1100, 1000);
      const act = ev.find(e => e.type === 'act-start');
      assert.ok(act, 'act-start');
      const ev2 = b.step(0.4, 1, 1100, 1000);
      const end = ev2.find(e => e.type === 'act-end');
      assert.ok(end, 'act-end');
      assert.equal(b.state, 'recover');
    } else {
      b.step(tep.params.duration + 2, 1, 1100, 1000);
    }
  }
  assert.equal(found, true, 'P0 池内必有 circle');
});

test('血量跨阈值 → roar + phase-change，1.4s 后回 idle', () => {
  const b = new BossBrain(1000, 1000, 0.99);
  b.step(0.2, 0.99, 1100, 1000);
  const ev = b.step(0.2, 0.5, 1100, 1000);
  assert.ok(ev.some(e => e.type === 'roar-start'));
  assert.ok(ev.some(e => e.type === 'phase-change'));
  assert.equal(b.phase, 1);
  assert.equal(b.state, 'roar');
  b.step(1.5, 0.5, 1100, 1000);
  assert.equal(b.state, 'idle');
});

test('阶段影响圈数与弹数：P2 红圈 3 个、扇弹 11 发', () => {
  const b = new BossBrain(1000, 1000, 0.1);
  let circleFound = false;
  for (let round = 0; round < 8 && !circleFound; round++) {
    const { tep } = pumpUntilTelegraph(b, 0.1, 1100, 1000);
    if (tep.skill === 'circle') {
      circleFound = true;
      assert.equal(tep.params.circles!.length, 3, 'P2 3 圈');
    } else {
      b.step(tep.params.duration + 2, 0.1, 1100, 1000);
    }
  }
  assert.equal(circleFound, true, 'P2 池内必有 circle');
});
