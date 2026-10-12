// 震动反馈工具：安全封装 navigator.vibrate + 持久化开关
// 开关单独存 localStorage（不进主存档，避免破坏旧存档结构）
const KEY = 'maidfish-survivor-vib-v1';

function load(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;   // 存储不可用时不拦功能
  }
}

let enabled = load();

export function vibrateEnabled(): boolean {
  return enabled;
}

export function setVibrate(v: boolean): void {
  enabled = v;
  try {
    localStorage.setItem(KEY, v ? 'on' : 'off');
  } catch {
    /* 存储不可用时静默 */
  }
}

export function vibrate(pattern: number | number[]): void {
  if (!enabled) return;
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    if (typeof nav.vibrate === 'function') nav.vibrate(pattern);
  } catch {
    /* 无震动硬件/权限时静默降级 */
  }
}
