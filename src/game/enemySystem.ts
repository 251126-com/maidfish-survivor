// 敌人系统：池化敌人 + 追踪玩家 + 分离力（防止叠成一坨）+ 受击闪白 + 轻击退
// v0.10.0：命中后沿弹道方向给一段指数衰减的击退位移（Boss 免疫击退），
// 受击闪白从 0.08s 提到 0.11s，让"打中"更有存在感，但震屏仍只留给大事件。
import Phaser from 'phaser';
import { EntityPool, type Poolable } from '../core/pool.ts';
import { SpatialHash } from '../core/spatialHash.ts';
import { ENEMIES, type EnemyDef } from '../config/enemies.ts';
import { WORLD_W, WORLD_H, POOL_LIMIT, hpScale, speedScale } from '../config/balance.ts';

export class Enemy implements Poolable {
  // 唯一自增 id：子弹穿透时用它判重，避免重复扣血
  readonly uid: number = ++Enemy.uidSeq;
  private static uidSeq = 0;

  active = false;
  x = 0;
  y = 0;
  hp = 1;
  maxHp = 1;
  speed = 0;
  damage = 0;
  radius = 16;
  xp = 0;
  goldChance = 0;
  isBoss = false;
  orbitCd = 0;        // 环绕武器对该敌人的独立命中冷却
  // v0.10.0 击退位移（px/s 级初速，指数衰减到 0）
  knockX = 0;
  knockY = 0;
  def!: EnemyDef;
  sprite!: Phaser.GameObjects.Image;
  flash = 0;
  // v0.11.0 特殊敌人行为状态（spawn 时由 EnemySystem 按 def 初始化）
  move: 'chase' | 'float' | 'dash' = 'chase';
  auraT = 0;            // 水母：距下次麻痹圈开始的倒计时
  auraState: 0 | 1 = 0; // 0=待机 1=蓄圈预警中（站定）
  auraRemain = 0;       // 蓄圈预警剩余秒
  auraResolve = false;  // 本帧圈已蓄满，等待场景结算（伤害/减速）
  dashT = 0;            // 灯笼鱼：距下次冲刺倒计时
  dashTimer = 0;        // 冲刺进行中剩余秒
  dashVX = 0;
  dashVY = 0;
  dashActive = false;

  spawn(): void {
    this.flash = 0; this.orbitCd = 0; this.knockX = 0; this.knockY = 0;
    this.auraState = 0; this.auraRemain = 0; this.auraResolve = false;
    this.dashTimer = 0; this.dashVX = 0; this.dashVY = 0; this.dashActive = false;
  }
  despawn(): void { this.sprite.setVisible(false); }
}

export class EnemySystem {
  readonly pool: EntityPool<Enemy>;
  private hash: SpatialHash<Enemy>;
  private neighborBuf: Enemy[] = [];
  private readonly separationWeight = 0.7;   // 分离力权重，越大越不叠
  // 击杀回调：由 GameScene 注入，用于计分/掉落（在 release 之前调用，此时敌人数据仍有效）
  onKill: ((e: Enemy) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.hash = new SpatialHash<Enemy>(64, WORLD_W, WORLD_H);
    this.pool = new EntityPool<Enemy>(() => {
      const e = new Enemy();
      e.sprite = scene.add.image(0, 0, 'enemy_fish');
      e.sprite.setVisible(false);
      e.sprite.setDepth(10);
      return e;
    }, POOL_LIMIT.enemy);
  }

  // 生成敌人；到达池上限返回 null（保证帧率）
  spawn(defId: string, x: number, y: number, elapsed: number): Enemy | null {
    const def = ENEMIES[defId];
    if (!def) return null;
    const e = this.pool.acquire();
    if (!e) return null;

    e.def = def;
    e.x = x;
    e.y = y;
    // v0.10.0: Boss 血量固定不随 elapsed 膨胀（Boss 是节奏事件，普通敌人仍按时间成长）
    e.maxHp = e.isBoss ? def.hp : def.hp * hpScale(elapsed);
    e.hp = e.maxHp;
    e.speed = def.speed * speedScale(elapsed);
    e.damage = def.damage;
    e.radius = def.radius;
    e.xp = def.xp;
    e.goldChance = def.goldChance;
    e.isBoss = def.id === 'boss';

    // v0.11.0 特殊敌人行为初始化（随机错开节奏，避免全场同步蓄圈/冲刺）
    e.move = def.move ?? 'chase';
    e.auraT = def.aura ? def.aura.interval * (0.6 + Math.random() * 0.6) : 0;
    e.dashT = def.dash ? def.dash.cd * (0.5 + Math.random() * 0.5) : 0;

    e.sprite.setTexture(def.texture);
    e.sprite.setScale(def.scale);
    e.sprite.setPosition(x, y);
    e.sprite.setVisible(true);
    e.sprite.clearTint();
    return e;
  }

  // 每帧：重建空间哈希 → 追踪 + 分离 + 击退衰减
  update(dt: number, px: number, py: number): void {
    const live = this.pool.live;

    this.hash.clear();
    for (let i = 0; i < live.length; i++) {
      const e = live[i];
      this.hash.insert(e.x, e.y, e);
    }

    for (let i = 0; i < live.length; i++) {
      const e = live[i];

      // 朝玩家方向单位向量（水母/灯笼鱼在其非特殊阶段也复用）
      const dx = px - e.x;
      const dy = py - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let mx = dx / d;
      let my = dy / d;

      // 分离力：邻近敌人互相推开
      this.neighborBuf.length = 0;
      this.hash.queryCircle(e.x, e.y, e.radius * 2, this.neighborBuf);
      let sx = 0, sy = 0;
      for (let j = 0; j < this.neighborBuf.length; j++) {
        const o = this.neighborBuf[j];
        if (o === e) continue;
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const od = Math.hypot(ox, oy);
        const minD = e.radius + o.radius;
        if (od > 0.001 && od < minD) {
          const push = (minD - od) / minD;
          sx += (ox / od) * push;
          sy += (oy / od) * push;
        }
      }
      mx += sx * this.separationWeight;
      my += sy * this.separationWeight;
      const ml = Math.hypot(mx, my) || 1;

      // v0.11.0 移动模式：chase 直线追踪 / float 漂浮+蓄圈站定 / dash 慢速逼近+周期冲刺
      let mvx = 0, mvy = 0;
      if (e.move === 'float') {
        // 水母：蓄圈预警时站定不动，其余时间以基准速度漂浮逼近
        if (e.auraState !== 1) {
          mvx = (mx / ml) * e.speed * dt;
          mvy = (my / ml) * e.speed * dt;
        }
      } else if (e.move === 'dash') {
        // 灯笼鱼：冲刺中沿固定方向高速直线；否则慢速追踪
        if (e.dashActive) {
          e.dashTimer -= dt;
          mvx = e.dashVX * dt;
          mvy = e.dashVY * dt;
          if (e.dashTimer <= 0) {
            e.dashActive = false;
            e.dashT = (e.def.dash?.cd ?? 4.5) * (0.8 + Math.random() * 0.4);
          }
        } else {
          e.dashT -= dt;
          if (e.dashT <= 0) {
            // 起冲：朝玩家当前位置锁定直线方向（预警/实际路径一致，玩家可提前侧移）
            const l = Math.hypot(dx, dy) || 1;
            const sp = e.def.dash?.speed ?? 520;
            e.dashVX = (dx / l) * sp;
            e.dashVY = (dy / l) * sp;
            e.dashActive = true;
            e.dashTimer = e.def.dash?.dur ?? 0.55;
          } else {
            mvx = (mx / ml) * e.speed * dt;
            mvy = (my / ml) * e.speed * dt;
          }
        }
      } else {
        mvx = (mx / ml) * e.speed * dt;
        mvy = (my / ml) * e.speed * dt;
      }
      e.x += mvx;
      e.y += mvy;

      // v0.11.0 水母麻痹圈计时：蓄圈完成置 auraResolve 标记，由 GameScene 结算伤害/减速
      if (e.def.aura) {
        if (e.auraState === 1) {
          e.auraRemain -= dt;
          if (e.auraRemain <= 0) {
            e.auraState = 0;
            e.auraT = e.def.aura.interval;
            e.auraResolve = true;
          }
        } else {
          e.auraT -= dt;
          if (e.auraT <= 0) {
            e.auraState = 1;
            e.auraRemain = e.def.aura.telegraph;
          }
        }
      }

      // v0.10.0 击退：独立于追踪，指数衰减（时间常数 ~0.35s），Boss 不受击退
      if (e.knockX !== 0 || e.knockY !== 0) {
        const kf = Math.exp(-6.5 * dt);
        e.x += e.knockX * dt;
        e.y += e.knockY * dt;
        e.knockX *= kf;
        e.knockY *= kf;
        if (Math.abs(e.knockX) < 1 && Math.abs(e.knockY) < 1) { e.knockX = 0; e.knockY = 0; }
      }
      e.x = Phaser.Math.Clamp(e.x, 0, WORLD_W);
      e.y = Phaser.Math.Clamp(e.y, 0, WORLD_H);

      e.sprite.setPosition(e.x, e.y);
      e.sprite.setFlipX(e.x > px);

      if (e.orbitCd > 0) e.orbitCd -= dt;

      if (e.flash > 0) {
        e.flash -= dt;
        if (e.flash <= 0) e.sprite.clearTint();
      }
    }
  }

  // 沿 (dx,dy) 方向给敌人击退初速；Boss 免疫
  knock(e: Enemy, dx: number, dy: number, power: number): void {
    if (!e.active || e.isBoss) return;
    const l = Math.hypot(dx, dy) || 1;
    e.knockX += (dx / l) * power;
    e.knockY += (dy / l) * power;
  }

  // 造成伤害；返回是否击杀
  damage(e: Enemy, amount: number): boolean {
    e.hp -= amount;
    e.flash = 0.11;   // v0.10.0: 闪白稍长，命中感更清晰
    e.sprite.setTint(0xffffff);
    if (e.hp <= 0) {
      if (this.onKill) this.onKill(e);
      this.pool.release(e);
      return true;
    }
    return false;
  }

  get live(): Enemy[] { return this.pool.live; }
  get hashRef(): SpatialHash<Enemy> { return this.hash; }
  get count(): number { return this.pool.activeCount; }
}
