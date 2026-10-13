// Boss 战斗脑（纯逻辑，可单测；Phaser 表现层在 GameScene 中实现）
//
// 设计：3 种预警技能 + 3 阶段
//  1) dash    冲刺：预警画一条红色直线（0.9s），随后沿该线高速冲刺——反制=提前移出直线
//  2) spread  扇弹：预警聚能（0.85s 中心缩金丹），随后向玩家方向扇形弹幕——反制=侧向走位/拉开
//  3) circle  红圈：预警在地面生成 1~3 个不断扩大的红圈（1.15s），随后炸裂——反制=走出红圈
// 阶段(按血量)：P0 >66% (1圈/7弹)、P1 33~66% (2圈/9弹+冲刺提速)、P2 <33% (3圈/11弹+更快)
// 阶段掉血跨阈值时：进入 roar(咆哮) 1.4s（免疫+播阶段词），再回到技能循环
// 暂停/升级面板打开时 GameScene 不推进本脑 → 自然冻结。

export type BossSkillId = 'dash' | 'spread' | 'circle';
export type BossState =
  | 'idle'        // 等待下次出招
  | 'telegraph'   // 预警阶段（反制窗口）
  | 'act'         // 技能执行阶段
  | 'recover'     // 收招硬直
  | 'roar';       // 阶段切换咆哮（免疫、不输出伤害）

export interface SkillParams {
  /** dash：冲刺方向单位向量 + 起点 */
  dashDirX?: number; dashDirY?: number; dashFromX?: number; dashFromY?: number;
  /** spread：扇形朝向角、弹数、半角(弧度) */
  fanAngle?: number; fanCount?: number; fanHalf?: number;
  /** circle：预警圈（表现层会随时间放大），act 结束时炸裂 */
  circles?: { x: number; y: number; r: number }[];
  duration: number;
}

export interface BossEvent {
  type: 'roar-start' | 'phase-change' | 'telegraph-start' | 'act-start' | 'act-end' | 'recover-start' | 'idle-start' | 'skill-cancel';
  skill?: BossSkillId;
  phase: number;
  params?: SkillParams;
  hpRatio?: number;
}

export const BOSS_PHASE_HP = [2 / 3, 1 / 3] as const;   // 血量比阈值：>2/3 P0；>1/3 P1；否则 P2

export function bossPhaseFor(hpRatio: number): number {
  if (hpRatio > BOSS_PHASE_HP[0]) return 0;
  if (hpRatio > BOSS_PHASE_HP[1]) return 1;
  return 2;
}

const TIMING: Record<BossSkillId, { telegraph: number; act: number; recover: number }> = {
  dash: { telegraph: 0.9, act: 0.68, recover: 0.5 },
  spread: { telegraph: 0.85, act: 0.35, recover: 0.45 },
  circle: { telegraph: 1.15, act: 0.28, recover: 0.6 }
};

const ROAR_TIME = 1.4;
const IDLE_MIN = 0.55;   // 每招之间最短间隔

function clamp(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v; }

export class BossBrain {
  x: number;
  y: number;
  state: BossState = 'idle';
  stateT = 0;
  phase = 0;
  skill: BossSkillId = 'spread';
  lastSkill: BossSkillId | null = null;
  private dashDirX = 0;
  private dashDirY = 0;
  // v0.9.1：dash 预警记录冻结的起点（telegraph 开始时的 Boss 位置），
  // telegraph 期间 Boss 不移动（GameScene 冻结），act 沿用同一起点 → 预警线与实际路径一致
  private dashFromX = 0;
  private dashFromY = 0;
  private dashSpeed = 0;
  private telegraphDuration = 0;
  private actDuration = 0;
  private pendingEvents: BossEvent[] = [];
  private lastTelegraphParams: SkillParams | null = null;
  private circleCache: { x: number; y: number; r: number }[] = [];

  private rng: () => number;

  constructor(x: number, y: number, hpRatio: number, rng: () => number = Math.random) {
    this.x = x;
    this.y = y;
    this.phase = bossPhaseFor(hpRatio);
    this.rng = rng;
  }

  /** 推进一帧；返回本帧应触发的表现/伤害事件（纯逻辑，无副作用外） */
  step(dt: number, hpRatio: number, playerX: number, playerY: number): BossEvent[] {
    this.pendingEvents.length = 0;
    const phaseNow = bossPhaseFor(hpRatio);
    // 血量跨阈值（阶段号向上：P0→P1→P2）→ roar
    if (phaseNow > this.phase) {
      const oldPhase = this.phase;
      // v0.9.1：先判定当前技能是否在进行（此时 state 尚未改到 roar）
      if (this.state === 'telegraph' || this.state === 'act') {
        const canceled = this.skill;
        this.lastTelegraphParams = null;
        this.circleCache = [];
        this.pendingEvents.push({ type: 'skill-cancel', skill: canceled, phase: oldPhase, hpRatio });
      }
      this.phase = phaseNow;
      this.state = 'roar';
      this.stateT = 0;
      this.pendingEvents.push({ type: 'phase-change', phase: this.phase, hpRatio });
      this.pendingEvents.push({ type: 'roar-start', phase: this.phase, hpRatio });
      return this.pendingEvents;
    }
    if (phaseNow < this.phase) this.phase = phaseNow;   // 不会发生（仅防御）

    this.stateT += dt;
    switch (this.state) {
      case 'roar':
        if (this.stateT >= ROAR_TIME) this.toIdle();
        break;
      case 'idle':
        if (this.stateT >= IDLE_MIN) this.beginTelegraph(hpRatio, playerX, playerY);
        break;
      case 'telegraph':
        if (this.stateT >= this.telegraphDuration) this.beginAct(playerX, playerY);
        break;
      case 'act':
        this.runAct(dt, playerX, playerY);
        break;
      case 'recover':
        if (this.stateT >= TIMING[this.skill].recover) this.toIdle();
        break;
    }
    return this.pendingEvents;
  }

  private toIdle(): void {
    this.state = 'idle';
    this.stateT = 0;
    this.pendingEvents.push({ type: 'idle-start', phase: this.phase });
  }

  private pickSkill(): BossSkillId {
    const pool: BossSkillId[] = this.phase >= 2
      ? ['dash', 'spread', 'circle', 'dash', 'circle']
      : this.phase === 1
        ? ['dash', 'spread', 'circle', 'dash']
        : ['spread', 'spread', 'circle'];
    const cand = pool.filter(s => s !== this.lastSkill);
    this.lastSkill = this.skill = cand[Math.floor(this.rng() * cand.length)];
    return this.skill;
  }

  private beginTelegraph(hpRatio: number, px: number, py: number): void {
    const skill = this.pickSkill();
    this.state = 'telegraph';
    this.stateT = 0;
    this.telegraphDuration = TIMING[skill].telegraph;
    const params: SkillParams = { duration: this.telegraphDuration };
    if (skill === 'dash') {
      const dx = px - this.x, dy = py - this.y;
      const l = Math.hypot(dx, dy) || 1;
      this.dashDirX = dx / l;
      this.dashDirY = dy / l;
      this.dashSpeed = 500 + this.phase * 130;
      // v0.9.1：冻结并记录预警起点（GameScene 在 dash telegraph 期间冻结 Boss 位置）
      this.dashFromX = this.x;
      this.dashFromY = this.y;
      params.dashDirX = this.dashDirX;
      params.dashDirY = this.dashDirY;
      params.dashFromX = this.dashFromX;
      params.dashFromY = this.dashFromY;
    } else if (skill === 'spread') {
      const a = Math.atan2(py - this.y, px - this.x);
      params.fanAngle = a;
      params.fanCount = 7 + this.phase * 2;
      params.fanHalf = 0.42;
    } else {
      const count = 1 + this.phase;
      const circles: { x: number; y: number; r: number }[] = [];
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + this.rng() * 0.8;
        const rad = 90 + this.rng() * 130;
        circles.push({ x: px + Math.cos(ang) * rad, y: py + Math.sin(ang) * rad, r: 58 + this.phase * 8 });
      }
      // 第 0 个圈紧贴玩家当前位置（保证有威胁）
      circles[0].x = px;
      circles[0].y = py;
      params.circles = circles;
      this.circleCache = circles;
    }
    this.lastTelegraphParams = params;
    this.pendingEvents.push({ type: 'telegraph-start', skill, phase: this.phase, params });
  }

  private beginAct(px: number, py: number): void {
    this.state = 'act';
    this.stateT = 0;
    const act = TIMING[this.skill].act;
    this.actDuration = act;
    const params: SkillParams = { duration: act };
    if (this.skill === 'dash') {
      // v0.9.1：沿用 telegraph 记录的冻结起点（若 GameScene 未冻结，也强制拉回，保证路径一致）
      this.x = this.dashFromX;
      this.y = this.dashFromY;
      params.dashDirX = this.dashDirX;
      params.dashDirY = this.dashDirY;
      params.dashFromX = this.dashFromX;
      params.dashFromY = this.dashFromY;
    } else if (this.skill === 'spread') {
      params.fanAngle = Math.atan2(py - this.y, px - this.x);
      params.fanCount = 7 + this.phase * 2;
      params.fanHalf = 0.42;
    } else {
      params.circles = this.circleCache.map(c => ({ ...c }));
    }
    this.pendingEvents.push({ type: 'act-start', skill: this.skill, phase: this.phase, params });
  }

  private runAct(dt: number, px: number, py: number): void {
    if (this.skill === 'dash') {
      this.x += this.dashDirX * this.dashSpeed * dt;
      this.y += this.dashDirY * this.dashSpeed * dt;
    }
    if (this.stateT >= this.actDuration) {
      this.pendingEvents.push({ type: 'act-end', skill: this.skill, phase: this.phase, params: this.lastTelegraphParams ?? undefined });
      this.state = 'recover';
      this.stateT = 0;
    }
  }

  get dashing(): boolean { return this.state === 'act' && this.skill === 'dash'; }
  get dashDir(): { x: number; y: number } { return { x: this.dashDirX, y: this.dashDirY }; }
  get currentSkill(): BossSkillId { return this.skill; }
  get telegraphProg(): number {
    if (this.state !== 'telegraph') return 0;
    return clamp(this.stateT / this.telegraphDuration, 0, 1);
  }
  /** 预警/执行阶段的技能参数（dash 直线 / spread 聚能角 / circle 用 warningCircles）；非预警态按状态安全返回 null */
  get telegraphParams(): SkillParams | null {
    return (this.state === 'telegraph' || this.state === 'act') ? this.lastTelegraphParams : null;
  }
  get warningCircles(): { x: number; y: number; r: number }[] { return this.circleCache; }
  get inTelegraph(): boolean { return this.state === 'telegraph'; }
  get inAct(): boolean { return this.state === 'act'; }
}
