// v0.10.0 连杀系统（纯逻辑，可单测）：击杀在窗口期（默认 3 秒）内连续累计，
// 断档自动清零。GameScene 用它触发"5 连杀！"等里程碑反馈。
export class KillStreak {
  count = 0;
  private remaining = 0;

  windowSec: number;

  constructor(windowSec = 3.0) {
    this.windowSec = windowSec;
  }

  // 每帧衰减；窗口耗尽把连杀清零
  tick(dt: number): void {
    if (this.remaining <= 0) return;
    this.remaining -= dt;
    if (this.remaining <= 0) this.count = 0;
  }

  // 记录一次击杀；返回新的连杀数
  add(): number {
    this.count++;
    this.remaining = this.windowSec;
    return this.count;
  }

  // 是否到达里程碑（每 n 连杀一次），用于触发一次性反馈
  isMilestone(n: number): boolean {
    return this.count > 0 && this.count % n === 0;
  }

  get current(): number { return this.count; }
  get timeLeft(): number { return Math.max(0, this.remaining); }
}
