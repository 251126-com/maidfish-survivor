// 武器系统：数据驱动。支持多武器同时开火 + 环绕类武器 + v0.12.0 连锁闪电/持续光束
// 索敌用敌人空间哈希，避免每帧 O(n) 全表扫描
import Phaser from 'phaser';
import { EntityPool, type Poolable } from '../core/pool.ts';
import { WEAPONS, type WeaponDef, type WeaponLevelDef, type MutationDef } from '../config/weapons.ts';
import { POOL_LIMIT } from '../config/balance.ts';
import { sfx } from '../core/audio.ts';
import { vibrate } from '../core/vibration.ts';
import { DamageTextSystem } from './damageText.ts';
import type { Player } from './player.ts';
import type { EnemySystem, Enemy } from './enemySystem.ts';

export class Bullet implements Poolable {
  active = false;
  x = 0; y = 0;
  vx = 0; vy = 0;
  damage = 0;
  pierce = 0;
  radius = 6;
  life = 2;
  isSniper = false;
  splash = 0;               // 溅射半径（0 = 无溅射）
  hitUids: number[] = [];   // 已命中敌人 uid，防穿透重复扣血
  // v0.12.0 质变/武器效果字段（fire 时按质变与武器配置写入）
  bounceLeft = 0;           // 弹射剩余次数
  bounceRange = 0;          // 弹射搜索半径
  burnDps = 0;              // 燃烧每秒伤害
  burnDur = 0;              // 燃烧持续秒
  slowFactor = 0;           // 冰冻减速因子
  slowDur = 0;              // 冰冻持续秒
  knockMult = 1;            // 击退倍率
  sprite!: Phaser.GameObjects.Image;

  spawn(): void {
    this.hitUids.length = 0;
    this.life = 2;
    this.splash = 0;
    this.bounceLeft = 0; this.bounceRange = 0;
    this.burnDps = 0; this.burnDur = 0;
    this.slowFactor = 0; this.slowDur = 0;
    this.knockMult = 1;
  }
  despawn(): void { this.sprite.setVisible(false); }
}

export class OwnedWeapon {
  def: WeaponDef;
  level = 1;      // 1-based
  cd = 0;         // 剩余冷却秒
  mutation: MutationDef | null = null;   // v0.12.0 质变：一把武器同时只带一个

  constructor(def: WeaponDef) { this.def = def; }
  get stats(): WeaponLevelDef { return this.def.levels[Math.min(this.level, this.def.maxLevel) - 1]; }
  get maxed(): boolean { return this.level >= this.def.maxLevel; }
}

// 连锁闪电的临时闪电段（记录各端点，绘制几帧后消失）
interface Bolt {
  g: Phaser.GameObjects.Graphics;
  segs: { x: number; y: number }[];
  life: number;
  max: number;
}

export class WeaponSystem {
  private scene: Phaser.Scene;
  readonly owned: OwnedWeapon[] = [];
  private bulletPool: EntityPool<Bullet>;
  readonly damageText: DamageTextSystem;
  // v0.10.0 命中特效回调（暴击火花等）：由 GameScene 注入，保持本系统与表现解耦
  onHitFx: ((e: Enemy, crit: boolean) => void) | null = null;
  private finSprites: Phaser.GameObjects.Image[] = [];
  private finAngle = 0;
  private neighborBuf: Enemy[] = [];
  private splashBuf: Enemy[] = [];   // 溅射单独用一份缓冲，避免和外层查询互相踩
  // v0.12.0 深海激光：持续光束绘制层（深度在子弹之上）
  private beamG: Phaser.GameObjects.Graphics;
  private beamTick = 0;
  // v0.12.0 连锁闪电表现：池化 Graphics，寿命结束销毁
  private bolts: Bolt[] = [];
  private boltSeq = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bulletPool = new EntityPool<Bullet>(() => {
      const b = new Bullet();
      b.sprite = scene.add.image(0, 0, 'bullet');
      b.sprite.setVisible(false);
      b.sprite.setDepth(15);
      return b;
    }, POOL_LIMIT.bullet);
    this.damageText = new DamageTextSystem(scene);
    this.beamG = scene.add.graphics().setDepth(16).setScrollFactor(1);
  }

  addWeapon(id: string): boolean {
    if (this.owned.some(w => w.def.id === id)) return false;
    const def = WEAPONS[id];
    if (!def) return false;
    this.owned.push(new OwnedWeapon(def));
    return true;
  }

  hasWeapon(id: string): boolean { return this.owned.some(w => w.def.id === id); }

  upgradeWeapon(id: string): boolean {
    const w = this.owned.find(o => o.def.id === id);
    if (!w || w.maxed) return false;
    w.level++;
    return true;
  }

  // v0.12.0 质变：给已拥有武器挂上质变分支（一把武器只能有一个，重复挂返回 false）
  mutateWeapon(id: string, mutationId: string): boolean {
    const w = this.owned.find(o => o.def.id === id);
    if (!w || w.mutation) return false;
    const m = w.def.mutations?.find(x => x.id === mutationId);
    if (!m) return false;
    w.mutation = m;
    return true;
  }

  // 进化：把满级武器原地替换成进化形态（保留槽位顺序）
  evolveWeapon(fromId: string): boolean {
    const idx = this.owned.findIndex(o => o.def.id === fromId);
    if (idx < 0) return false;
    const w = this.owned[idx];
    if (!w.def.evolution) return false;
    const target = WEAPONS[w.def.evolution.evolvesTo];
    if (!target) return false;
    if (this.owned.some(o => o.def.id === target.id)) return false;   // 已进化过
    this.owned[idx] = new OwnedWeapon(target);
    return true;
  }

  // 供 UI 展示的环绕武器（tail）需要几个尾鳍
  private ensureFins(count: number): void {
    while (this.finSprites.length < count) {
      const s = this.scene.add.image(0, 0, 'fin');
      s.setDepth(19);
      this.finSprites.push(s);
    }
    for (let i = 0; i < this.finSprites.length; i++) {
      this.finSprites[i].setVisible(i < count);
    }
  }

  update(dt: number, player: Player, enemies: EnemySystem): void {
    // 开火：步枪/狙击/霰弹/珊瑚弩/泡泡枪走弹道；尾鳍环绕单独；电鳗/激光各自独立
    for (let i = 0; i < this.owned.length; i++) {
      const w = this.owned[i];
      if (w.def.id === 'tail') continue;
      if (w.def.id === 'eel') { this.updateEel(dt, w, player, enemies); continue; }
      if (w.def.beam) { this.updateBeam(dt, w, player, enemies); continue; }
      w.cd -= dt;
      if (w.cd > 0) continue;
      const target = this.findNearest(player.x, player.y, w.stats.range, enemies);
      if (!target) continue;
      // 只有整轮齐射成功才进入冷却；容量不足时下帧重试，避免半发齐射吞冷却
      if (this.fire(w, player, target)) w.cd = w.stats.cooldown;
    }

    this.updateOrbit(dt, player, enemies);
    this.updateBullets(dt, enemies, player);
    this.updateBolts(dt);
    // 关键：每帧 compact 子弹池。
    // 缺陷回归（v0.4.0）：release 只打标记，若从不 compact，live 表会被死子弹占满，
    // 达到 POOL_LIMIT 后 acquire 永远返回 null，长战斗后永久停火且 live 表内存只增不减。
    this.bulletPool.compact();
    this.damageText.update(dt);
  }

  // 质变参数应用到一发子弹（弹道类武器）
  private applyMutationToBullet(b: Bullet, w: OwnedWeapon, s: WeaponLevelDef): void {
    const m = w.mutation;
    if (!m) return;
    const p = m.params ?? {};
    switch (m.mod) {
      case 'pierce': b.pierce += p.pierce ?? 2; b.damage *= p.dmgMult ?? 0.9; break;
      case 'explosive': b.splash = Math.max(b.splash, p.radius ?? 70); b.damage *= p.dmgMult ?? 0.75; break;
      case 'bounce': b.bounceLeft = p.count ?? 2; b.bounceRange = p.range ?? 300; break;
      case 'burn': b.burnDps = p.dps ?? 10; b.burnDur = p.dur ?? 1.6; break;
      case 'freeze': b.slowFactor = p.factor ?? 0.5; b.slowDur = p.dur ?? 1.2; break;
      case 'knockback': b.knockMult = p.mult ?? 1.6; break;
      case 'count': break;   // count 类质变在 fire 里处理弹数
      case 'splash': b.splash += p.radius ?? 45; break;
      default: break;
    }
  }

  // 质变参数应用到武器当前数值（非弹道类：电鳗/激光）
  private mutationForWeapon(w: OwnedWeapon, key: string, fallback: number): number {
    const m = w.mutation;
    if (!m) return fallback;
    const p = m.params ?? {};
    if (key === 'count' && m.mod === 'count') return fallback + (p.count ?? 1);
    if (key === 'chain' && m.mod === 'chain') return fallback + (p.chain ?? 1);
    if (key === 'dmg') {
      if (m.mod === 'chain') return fallback * (p.dmgMult ?? 1.15);
      if (m.mod === 'explosive') return fallback * (p.dmgMult ?? 0.85);
      if (m.mod === 'laserFocus') return fallback * (p.dmgMult ?? 1.25);
    }
    if (key === 'range' && m.mod === 'laserRange') return fallback + (p.range ?? 160);
    if (key === 'splash' && m.mod === 'explosive') return fallback + (p.radius ?? 0);
    return fallback;
  }

  private fire(w: OwnedWeapon, player: Player, target: Enemy): boolean {
    const s = w.stats;
    const mutCount = w.mutation?.mod === 'count' ? (w.mutation.params?.count ?? 1) : 0;
    const count = s.count + mutCount;
    // 容量预检：整轮齐射要能一次拿齐，否则不出手（保帧率、防半发齐射）
    if (this.bulletPool.live.length + count > POOL_LIMIT.bullet) return false;
    // 开火后坐反馈：接玩家程序化动画（每次齐射一次）；
    // 震动只给 12ms 的轻触感，持续射击下不会糊（受持久开关控制）
    player.onFire();
    vibrate(12);
    // 重武器用更沉的音色，普通枪轻快
    if (w.def.id === 'sniper' || w.def.id === 'railgun' || w.def.id === 'fatfishCannon') sfx.sniper();
    else if (w.def.id === 'coral') sfx.sniper();
    else sfx.shoot();
    const baseAngle = Math.atan2(target.y - player.y, target.x - player.x);
    const spread = s.spread ?? 0.14;   // 多发时的扇形间隔（v0.11.0 霰弹枪更宽）
    for (let i = 0; i < count; i++) {
      const offset = count > 1 ? (i - (count - 1) / 2) * spread : 0;
      const a = baseAngle + offset;
      const b = this.bulletPool.acquire();
      if (!b) return false;
      b.x = player.x;
      b.y = player.y;
      b.vx = Math.cos(a) * s.speed;
      b.vy = Math.sin(a) * s.speed;
      b.damage = s.damage * player.stats.damageMult;
      b.pierce = s.pierce;
      b.radius = w.def.id === 'sniper' ? 10 : w.def.id === 'shotgun' ? 5 : w.def.id === 'bubble' ? 12 : (s.splash ? 12 : 6);
      b.isSniper = w.def.id === 'sniper';
      b.splash = s.splash ?? 0;
      b.knockMult = s.knockMult ?? 1;
      // v0.11.0 短射程武器（霰弹枪）：寿命按射程折算，弹丸不会飘出扇形射程太远
      b.life = s.life ?? 2;
      // v0.12.0 质变参数
      this.applyMutationToBullet(b, w, s);
      // 弹道贴图：狙击细条 / 溅射炮弹 / 珊瑚箭 / 泡泡 / 默认步枪弹
      let tex = 'bullet';
      if (b.isSniper) tex = 'bullet_sniper';
      else if (w.def.id === 'coral') tex = 'bullet_coral';
      else if (w.def.id === 'bubble') tex = 'bullet_bubble';
      else if (b.splash > 0) tex = 'bullet_cannon';
      b.sprite.setTexture(tex);
      b.sprite.setPosition(b.x, b.y);
      b.sprite.setRotation(a);
      b.sprite.setVisible(true);
    }
    return true;
  }

  private updateBullets(dt: number, enemies: EnemySystem, player: Player): void {
    const live = this.bulletPool.live;
    for (let i = 0; i < live.length; i++) {
      const b = live[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) { this.bulletPool.release(b); continue; }

      b.sprite.setPosition(b.x, b.y);

      // 与敌人碰撞
      // 注意：查询半径必须覆盖"单帧位移 + 敌人半径"，否则低帧率时子弹会穿过敌人。
      // 最快子弹 1200px/s，dt 上限 0.05s → 单帧最多 60px，这里留 70px 余量。
      this.neighborBuf.length = 0;
      enemies.hashRef.queryCircle(b.x, b.y, b.radius + 70, this.neighborBuf);
      for (let j = 0; j < this.neighborBuf.length; j++) {
        const e = this.neighborBuf[j];
        if (!e.active) continue;
        if (b.hitUids.indexOf(e.uid) !== -1) continue;
        const rr = b.radius + e.radius;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        if (dx * dx + dy * dy > rr * rr) continue;

        b.hitUids.push(e.uid);
        this.applyDamage(e, b.damage, enemies, player, { x: b.vx, y: b.vy }, b.knockMult);

        // v0.12.0 燃烧/冰冻效果附着
        if (b.burnDps > 0) { e.burnDps = b.burnDps; e.burnT = Math.max(e.burnT, b.burnDur); }
        if (b.slowFactor > 0) { e.slowFactor = Math.min(e.slowFactor || 1, b.slowFactor); e.slowT = Math.max(e.slowT, b.slowDur); }

        // 溅射：命中点周围的其他敌人吃 50% 伤害
        if (b.splash > 0) {
          this.splashBuf.length = 0;
          enemies.hashRef.queryCircle(e.x, e.y, b.splash, this.splashBuf);
          for (let k = 0; k < this.splashBuf.length; k++) {
            const o = this.splashBuf[k];
            if (o === e || !o.active) continue;
            const sdx = o.x - e.x;
            const sdy = o.y - e.y;
            if (sdx * sdx + sdy * sdy > b.splash * b.splash) continue;
            this.applyDamage(o, b.damage * 0.5, enemies, player, { x: b.vx, y: b.vy }, b.knockMult);
            if (b.burnDps > 0) { o.burnDps = b.burnDps; o.burnT = Math.max(o.burnT, b.burnDur); }
          }
        }

        b.pierce--;
        if (b.pierce <= 0) {
          // v0.12.0 弹射质变：穿透耗尽后跳向附近未命中敌人
          if (b.bounceLeft > 0) {
            const excl = new Set(b.hitUids);
            const next = this.findNearest(b.x, b.y, b.bounceRange, enemies, excl);
            if (next) {
              b.bounceLeft--;
              b.pierce = 1;
              const nv = Math.hypot(b.vx, b.vy);
              const ax = next.x - b.x;
              const ay = next.y - b.y;
              const al = Math.hypot(ax, ay) || 1;
              b.vx = (ax / al) * nv;
              b.vy = (ay / al) * nv;
              b.sprite.setRotation(Math.atan2(b.vy, b.vx));
              break;   // 本帧不再结算其他命中，留给下一帧追尾
            }
          }
          this.bulletPool.release(b);
          break;
        }
      }
    }
  }

  // 鲨尾环绕：尾鳍绕玩家旋转，碰到敌人造成伤害（每敌人有独立冷却）
  private updateOrbit(dt: number, player: Player, enemies: EnemySystem): void {
    const w = this.owned.find(o => o.def.id === 'tail');
    if (!w) {
      for (const s of this.finSprites) s.setVisible(false);
      return;
    }
    const s = w.stats;
    this.ensureFins(s.count);
    this.finAngle += s.speed * dt;
    if (this.finAngle > Math.PI * 2) this.finAngle -= Math.PI * 2;

    for (let i = 0; i < s.count; i++) {
      const a = this.finAngle + (Math.PI * 2 * i) / s.count;
      const fx = player.x + Math.cos(a) * s.range;
      const fy = player.y + Math.sin(a) * s.range;
      const fin = this.finSprites[i];
      fin.setPosition(fx, fy);
      fin.setRotation(a + Math.PI / 2);

      // 命中判定
      this.neighborBuf.length = 0;
      enemies.hashRef.queryCircle(fx, fy, 24, this.neighborBuf);
      for (let j = 0; j < this.neighborBuf.length; j++) {
        const e = this.neighborBuf[j];
        if (!e.active) continue;
        const rr = 22 + e.radius;
        const dx = e.x - fx;
        const dy = e.y - fy;
        if (dx * dx + dy * dy > rr * rr) continue;
        if (e.orbitCd > 0) continue;
        e.orbitCd = s.cooldown;
        this.applyDamage(e, s.damage * player.stats.damageMult, enemies, player, { x: e.x - fx, y: e.y - fy });
      }
    }
  }

  // v0.12.0 电鳗：连锁闪电。命中首个目标后自动跳向下一个（跳跃半径内最近未命中者）
  private updateEel(dt: number, w: OwnedWeapon, player: Player, enemies: EnemySystem): void {
    w.cd -= dt;
    if (w.cd > 0) return;
    let s = w.stats;
    const chainCount = this.mutationForWeapon(w, 'chain', s.chain ?? 3);
    const chainRadius = s.chainRadius ?? 170;
    const first = this.findNearest(player.x, player.y, s.range, enemies);
    if (!first) return;
    w.cd = s.cooldown;

    // 构建跳链路径
    const path: Enemy[] = [first];
    const used = new Set<number>([first.uid]);
    let cur = first;
    for (let i = 1; i < chainCount; i++) {
      const next = this.findNearest(cur.x, cur.y, chainRadius, enemies, used);
      if (!next) break;
      used.add(next.uid);
      path.push(next);
      cur = next;
    }
    // 结算伤害
    const dmg = this.mutationForWeapon(w, 'dmg', s.damage) * player.stats.damageMult;
    for (let i = 0; i < path.length; i++) {
      this.applyDamage(path[i], dmg, enemies, player, { x: path[i].x - player.x, y: path[i].y - player.y });
      // v0.12.0 电磁暴质变：每次命中附加小范围溅射
      const spl = this.mutationForWeapon(w, 'splash', 0);
      if (spl > 0) {
        this.splashBuf.length = 0;
        enemies.hashRef.queryCircle(path[i].x, path[i].y, spl, this.splashBuf);
        for (let k = 0; k < this.splashBuf.length; k++) {
          const o = this.splashBuf[k];
          if (o === path[i] || !o.active || used.has(o.uid)) continue;
          if (o.orbitCd > 0) continue;   // 借用环绕冷却字段做单帧防重复
          o.orbitCd = 0.5;
          this.applyDamage(o, dmg * 0.5, enemies, player, { x: o.x - path[i].x, y: o.y - path[i].y });
        }
      }
    }
    player.onFire();
    vibrate(8);
    sfx.sniper();
    // 闪电表现：玩家 → 首个 → … → 末端
    const pts: { x: number; y: number }[] = [{ x: player.x, y: player.y }];
    for (const e of path) pts.push({ x: e.x, y: e.y });
    this.spawnBolt(pts, 0xcfe8ff);
  }

  // v0.12.0 深海激光：持续光束，锁定射程内最近敌人，按 tick 间隔结算伤害
  private updateBeam(dt: number, w: OwnedWeapon, player: Player, enemies: EnemySystem): void {
    const s = w.stats;
    const range = this.mutationForWeapon(w, 'range', s.range);
    const target = this.findNearest(player.x, player.y, range, enemies);
    const g = this.beamG;
    if (!target) {
      g.clear();
      this.beamTick = 0;
      return;
    }
    // 画光束：外圈粉紫 + 内芯白
    g.clear();
    const pulse = 0.7 + 0.3 * Math.sin(this.beamPulse(dt));
    g.lineStyle(7, 0xff5ad0, 0.35 * pulse);
    g.beginPath(); g.moveTo(player.x, player.y); g.lineTo(target.x, target.y); g.strokePath();
    g.lineStyle(2, 0xfff2fb, 0.85);
    g.beginPath(); g.moveTo(player.x, player.y); g.lineTo(target.x, target.y); g.strokePath();

    // 命中点小光球
    g.fillStyle(0xffb0e8, 0.9);
    g.fillCircle(target.x, target.y, 7);

    this.beamTick -= dt;
    if (this.beamTick <= 0) {
      this.beamTick = s.tick ?? 0.12;
      const dmg = this.mutationForWeapon(w, 'dmg', s.damage) * player.stats.damageMult;
      this.applyDamage(target, dmg, enemies, player, { x: target.x - player.x, y: target.y - player.y });
      player.onFire();
      vibrate(5);
      sfx.shoot();
    }
  }

  private beamPhase = 0;
  private beamPulse(dt: number): number {
    this.beamPhase += dt * 14;
    return this.beamPhase;
  }

  // 闪电视觉：锯齿线段，池化 Graphics，短寿命淡出
  private spawnBolt(pts: { x: number; y: number }[], color: number): void {
    let bolt: Bolt | null = null;
    for (let i = 0; i < this.bolts.length; i++) {
      const b = this.bolts[i];
      if (b.life <= 0) { bolt = b; break; }
    }
    if (!bolt) {
      if (this.bolts.length >= 12) { const oldest = this.bolts[0]; oldest.g.destroy(); this.bolts.shift(); }
      bolt = { g: this.scene.add.graphics().setDepth(17), segs: [], life: 0, max: 1 };
      this.bolts.push(bolt);
    }
    bolt.segs = pts;
    bolt.life = bolt.max = 0.16 + Math.random() * 0.06;
    // 锯齿化：在相邻端点之间插入抖动折点
    bolt.g.clear();
    bolt.g.lineStyle(3, color, 0.9);
    bolt.g.lineStyle(1, 0xffffff, 0.6);
    bolt.g.beginPath();
    bolt.g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const sx = pts[i - 1].x;
      const sy = pts[i - 1].y;
      const ex = pts[i].x;
      const ey = pts[i].y;
      const midX = (sx + ex) / 2 + (Math.random() - 0.5) * 26;
      const midY = (sy + ey) / 2 + (Math.random() - 0.5) * 26;
      bolt.g.lineTo(midX, midY);
      bolt.g.lineTo(ex, ey);
    }
    bolt.g.strokePath();
  }

  private updateBolts(dt: number): void {
    for (let i = 0; i < this.bolts.length; i++) {
      const b = this.bolts[i];
      if (b.life <= 0) continue;
      b.life -= dt;
      const k = Phaser.Math.Clamp(b.life / b.max, 0, 1);
      b.g.setAlpha(k);
      if (b.life <= 0) b.g.clear();
    }
  }

  private applyDamage(e: Enemy, base: number, enemies: EnemySystem, player: Player, dir?: { x: number; y: number }, knockMult = 1): void {
    let dmg = base;
    const crit = Math.random() < player.stats.critChance;
    if (crit) dmg *= player.stats.critMult;
    // 浮动伤害数字：命中/暴击反馈的核心一环
    this.damageText.show(e.x, e.y, dmg, { crit });
    // v0.10.0 命中轻击退（Boss 免疫）：沿弹道方向，按敌人重量分级 × knockMult
    if (dir) {
      const power = (e.def.id === 'fat' ? 130 : e.def.id === 'dart' ? 160 : 110) * knockMult;
      enemies.knock(e, dir.x, dir.y, power);
    }
    // v0.10.0 暴击命中火花（克制 3 粒）
    if (crit) this.onHitFx?.(e, crit);
    enemies.damage(e, dmg);
  }

  // 最近敌人；exclude 可选（弹射/连锁时排除已命中 uid）
  private findNearest(x: number, y: number, range: number, enemies: EnemySystem, exclude?: Set<number>): Enemy | null {
    this.neighborBuf.length = 0;
    enemies.hashRef.queryCircle(x, y, range, this.neighborBuf);
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (let i = 0; i < this.neighborBuf.length; i++) {
      const e = this.neighborBuf[i];
      if (!e.active) continue;
      if (exclude && exclude.has(e.uid)) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  get bulletCount(): number { return this.bulletPool.activeCount; }
  get bullets(): Bullet[] { return this.bulletPool.live; }
}
