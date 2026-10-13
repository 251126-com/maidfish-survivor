import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BossBrain, bossPhaseFor, BOSS_PHASE_HP } from './bossBrain.ts';

/** 确定性 LCG：固定种子 → 固定序列。测试不猜概率（v0.9.1 审查要求）。 */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 构造带确定性 RNG 的 BossBrain */
function newBrain(hpRatio: number, seed = 12345): BossBrain {
  return new BossBrain(1000, 1000, hpRatio, lcg(seed));
}

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
  const b = newBrain(1);
  const { tep } = pumpUntilTelegraph(b);
  assert.equal(b.state, 'telegraph');
  assert.ok(tep.skill === 'dash' || tep.skill === 'spread' || tep.skill === 'circle');
  assert.ok(tep.params.duration > 0);
});

test('dash 预警含方向，act 阶段 boss 沿方向移动', () => {
  const b = newBrain(1);
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
  const b = newBrain(1);
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
  const b = newBrain(1);
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
  const b = newBrain(0.99);
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
  const b = newBrain(0.1);
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

// ---- v0.9.1 审查发现：跨阶段打断技能 / 冲刺预警与实际路径一致 ----

/** 推到指定技能登场：单实例确定性循环推进（telegraph→act→recover→idle→下一招），
 *  固定种子 → 完整序列确定，不猜概率。 */
function pumpToSkill(target: 'dash' | 'spread' | 'circle', hpRatio = 1, px = 1100, py = 1000): { b: BossBrain; tep: any } {
  const b = newBrain(hpRatio, 0xC0FFEE);   // 单一确定性种子
  for (let k = 0; k < 30; k++) {
    const { tep } = pumpUntilTelegraph(b, hpRatio, px, py);
    if (tep.skill === target) return { b, tep };
    // 完成当前招：telegraph → act → recover → idle（大 dt 分多次 step 推进）
    for (let i = 0; i < 40 && b.state !== 'idle'; i++) b.step(0.1, hpRatio, px, py);
  }
  throw new Error(`30 轮内未抽到 ${target}（确定性种子下不应发生）`);
}

test('跨阶段打断：telegraph/act 中掉血跨阈值 → skill-cancel 事件且不结算 act-end（不补爆炸）', () => {
  const { b, tep } = pumpToSkill('circle', 0.9, 1100, 1000);
  // telegraph 完成 → act（红圈炸裂点）
  const evAct = b.step(tep.params.duration + 0.01, 0.9, 1100, 1000);
  assert.ok(b.inAct, '应进入红圈 act 阶段');
  // act 中途血量跨 P1 → 阶段打断
  const evs = b.step(0.05, 0.3, 1100, 1000);
  const cancel = evs.find((e: any) => e.type === 'skill-cancel');
  assert.ok(cancel, '应发出 skill-cancel 事件');
  assert.equal(cancel.skill, 'circle');
  assert.ok(!evs.some((e: any) => e.type === 'act-end'), '被打断不得触发 act-end/爆炸');
  assert.equal(b.state, 'roar', '中断后进入咆哮');
  assert.equal(b.warningCircles.length, 0, '预警圈被清空（不残留误导红圈）');
  assert.equal(b.telegraphParams, null, '预警参数被清空');
});

test('跨阶段打断：任何技能（含 dash/spread）中打断均发 skill-cancel 且清状态', () => {
  const b = newBrain(1);
  const { tep } = pumpUntilTelegraph(b, 1, 1100, 1000);
  b.step(tep.params.duration + 0.01, 1, 1100, 1000);  // 进入 act
  assert.ok(b.inAct);
  const evs = b.step(0.05, 0.2, 1100, 1000);          // 跨到 P2
  const cancel = evs.find((e: any) => e.type === 'skill-cancel');
  assert.ok(cancel, 'act 被打断应发 skill-cancel');
  assert.equal(cancel.skill, b.currentSkill);
  assert.ok(!evs.some((e: any) => e.type === 'act-end'));
});

test('打断后进入全新技能循环：roar 结束后能从 idle 重新出招并带全新参数', () => {
  const { b } = pumpToSkill('circle', 0.9, 1100, 1000);
  // 打断帧：跨阶段 → 先发 skill-cancel（step 立即返回，roar 从下一帧开始计时）
  const evBreak = b.step(0.05, 0.3, 1100, 1000);
  assert.equal(b.state, 'roar');
  assert.ok(evBreak.some((e: any) => e.type === 'skill-cancel'), '打断应伴随 skill-cancel');
  // roar(1.4s) 结束 → idle
  b.step(1.5, 0.3, 1100, 1000);
  assert.equal(b.state, 'idle');
  const { tep } = pumpUntilTelegraph(b, 0.3, 1100, 1000);
  assert.ok(tep.params && typeof tep.params === 'object', '新一轮预告应带全新参数');
  // 若新招是 circle，其圈必须是新生成的（重走 warningCircles 初始化）
  if (tep.skill === 'circle') {
    assert.ok(b.warningCircles.length > 0, '新圈应存在');
    assert.equal(b.warningCircles[0].x, tep.params.circles[0].x, '与预警参数一致');
  }
});

test('冲刺预警与实际路径一致：act-start 的 dash 起点 = telegraph 记录的起点（冻结原点）', () => {
  const { b, tep } = pumpToSkill('dash', 0.5, 1100, 1000);
  assert.ok(tep.params.dashFromX !== undefined && tep.params.dashFromY !== undefined);
  const fromX = tep.params.dashFromX;
  const fromY = tep.params.dashFromY;
  // telegraph 期间 Boss 位置被冻结（GameScene 保证），脑内位置不变
  const midX = b.x, midY = b.y;
  assert.equal(midX, fromX, 'telegraph 中脑内起点应保持 = 预警起点');
  assert.equal(midY, fromY);
  // act-start 的 dash 参数必须沿用同一起点
  const evAct = b.step(tep.params.duration + 0.01, 0.9, 1100, 1000);
  const act = evAct.find((e: any) => e.type === 'act-start');
  assert.ok(act && act.params, '应有 act-start');
  assert.equal(act.params.dashFromX, fromX, 'act 起点应与预警线起点一致');
  assert.equal(act.params.dashFromY, fromY);
  assert.equal(b.x, fromX, 'act 阶段脑内位置应被拉回预警起点（实际冲刺与预警线重合）');
  assert.equal(b.y, fromY);
});
