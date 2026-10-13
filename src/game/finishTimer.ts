// v0.9.1 胜负结算展示计时器：墙钟驱动，抗低帧率。
// 背景：Phaser Clock.delayedCall 由游戏时钟驱动（fps.min=30+smoothStep 把每帧钳到 ≤33ms），
//       低帧率/共享CPU环境会让"展示1.1s再进结算"实际拖到数秒。此计时器用墙钟(performance.now)
//       推进、暂停/升级面板冻结、只触发一次，展示时长恒定可控。
export const RESULT_DELAY_MS = 1100;

export interface FinishTimer {
  readonly started: boolean;
  readonly fired: boolean;
  readonly shownMs: number;
  start(): void;
  /** 返回 true 表示展示时长已到（本局只触发一次） */
  tick(now: number, paused: boolean): boolean;
  reset(): void;
}

export function createFinishTimer(delayMs: number): FinishTimer {
  let started = false;
  let fired = false;
  let shownMs = 0;
  let base = 0;   // 墙钟基准：暂停/回退时重置，使暂停时长与异常回退不计入展示

  return {
    get started() { return started; },
    get fired() { return fired; },
    get shownMs() { return shownMs; },
    start() {
      if (started) return;              // 二次 start（重复 finish）不重置已累计展示
      started = true;
      base = 0;
      shownMs = 0;
    },
    tick(now, paused) {
      if (!started || fired) return false;
      if (now < base) {                 // 墙钟回退防御：不计入、不破坏状态
        shownMs = 0;
        base = now;
        return false;
      }
      if (paused) {                     // 暂停/面板冻结：只挪基准，不累计
        base = now;
        return false;
      }
      shownMs += now - base;
      base = now;
      if (shownMs >= delayMs) {
        fired = true;
        return true;
      }
      return false;
    },
    reset() {                           // 幂等：可重复调用，重置后可开始新一局
      started = false;
      fired = false;
      shownMs = 0;
      base = 0;
    }
  };
}
