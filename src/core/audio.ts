// 音效系统：用 WebAudio 实时合成，零音频素材依赖
// 设计：射击等高频音效做节流，避免糊成一片 + 减少节点创建开销

type Wave = OscillatorType;

// 音效开关持久化（与震动开关一致：单独存 localStorage，不进主存档）
const SFX_KEY = 'maidfish-survivor-sfx-v1';

function loadSfxEnabled(): boolean {
  try {
    return localStorage.getItem(SFX_KEY) !== 'off';
  } catch {
    return true;
  }
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastAt: Record<string, number> = {};
  enabled = loadSfxEnabled();
  volume = 0.35;

  // 必须在用户手势里调用一次（浏览器自动播放策略）
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;   // 合成不可用时静默降级，不影响游戏
    }
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (this.master) this.master.gain.value = v ? this.volume : 0;
    try {
      localStorage.setItem(SFX_KEY, v ? 'on' : 'off');
    } catch {
      /* 存储不可用时静默 */
    }
  }

  private ready(): boolean {
    return this.enabled && !!this.ctx && !!this.master;
  }

  // 节流：同名音效在 ms 内只响一次
  private throttle(key: string, ms: number): boolean {
    const now = performance.now();
    const last = this.lastAt[key] ?? -Infinity;
    if (now - last < ms) return false;
    this.lastAt[key] = now;
    return true;
  }

  // 单个振荡器音：可选频率滑动（指数）
  private tone(freq: number, dur: number, type: Wave, vol: number, slideTo?: number, delay = 0): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);       // 快速起音
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);      // 衰减
    osc.connect(g);
    g.connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // 噪声爆音：用于命中/爆炸质感
  private noise(dur: number, vol: number, filterFreq: number, delay = 0): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master!);
    src.start(t);
  }

  // ---- 具体音效 ----

  shoot(): void {
    if (!this.throttle('shoot', 55)) return;
    // v0.13.0 水下闷响枪声：低通噪声（深海水压感）+ 低频正弦下坠
    this.noise(0.10, 0.11, 320);
    this.tone(150, 0.13, 'sine', 0.10, 58);
  }

  // v0.13.0 大白饭碗筷脆声：两颗高频短促"叮"（筷子碰瓷碗）
  rice(): void {
    if (!this.throttle('rice', 90)) return;
    this.tone(2350, 0.05, 'sine', 0.10, 1800);
    this.tone(3180, 0.045, 'sine', 0.07, 2560, 0.018);
  }

  // v0.13.0 铁盆金属铛：低频基音 + 偏高泛音长衰减（金属共鸣感）
  bowlMetal(): void {
    if (!this.throttle('bowl', 140)) return;
    this.tone(620, 0.55, 'sine', 0.13, 605);
    this.tone(1270, 0.38, 'triangle', 0.07, 1230, 0.006);
    this.noise(0.07, 0.045, 2600);
  }

  sniper(): void {
    if (!this.throttle('sniper', 80)) return;
    this.tone(1400, 0.09, 'sawtooth', 0.10, 240);
  }

  hit(): void {
    if (!this.throttle('hit', 40)) return;
    this.noise(0.045, 0.06, 2600);
  }

  kill(): void {
    if (!this.throttle('kill', 60)) return;
    this.tone(520, 0.13, 'triangle', 0.09, 170);
  }

  // v0.12.0 连续拾取音调递增：step 越大音调越高（2s 窗口内连续拾取，见 GameScene.pickupStreak）
  pickup(step = 0): void {
    if (!this.throttle('pickup', 50)) return;
    const base = Math.min(1560, 1080 + step * 90);
    this.tone(base, 0.055, 'sine', 0.06, Math.min(2400, base * 1.45));
  }

  coin(): void {
    if (!this.throttle('coin', 60)) return;
    this.tone(1320, 0.07, 'sine', 0.07, 1760);
  }

  hurt(): void {
    if (!this.throttle('hurt', 180)) return;
    this.tone(180, 0.20, 'sawtooth', 0.16, 70);
    this.noise(0.12, 0.10, 900);
  }

  levelUp(): void {
    // 上行三音琶音
    this.tone(660, 0.12, 'triangle', 0.11, undefined, 0);
    this.tone(880, 0.12, 'triangle', 0.11, undefined, 0.09);
    this.tone(1320, 0.20, 'triangle', 0.12, undefined, 0.18);
  }

  evolve(): void {
    // 进化：更长更亮的五音上行
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((f, i) => this.tone(f, 0.18, 'square', 0.10, undefined, i * 0.07));
    this.noise(0.4, 0.05, 5000, 0.1);
  }

  boss(): void {
    // 低频轰鸣 + 长滑音
    this.tone(90, 1.1, 'sawtooth', 0.18, 45);
    this.tone(180, 0.9, 'square', 0.10, 90, 0.05);
    this.noise(0.7, 0.10, 400);
  }

  win(): void {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => this.tone(f, 0.30, 'triangle', 0.12, undefined, i * 0.13));
  }

  lose(): void {
    const notes = [440, 370, 294, 220];
    notes.forEach((f, i) => this.tone(f, 0.34, 'sawtooth', 0.11, undefined, i * 0.14));
  }
}

// 全局单例：各系统直接引用，避免层层传参
export const sfx = new Sfx();