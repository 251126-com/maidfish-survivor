// 悬浮球状态持久化（v0.5.0）
// 只存"位置 + 音效/震动开关"这类轻量偏好，独立于主存档（不破坏旧存档结构）。
// store 可注入便于单测；默认 localStorage，不可用时内存兜底，绝不抛错。

export interface FloatBallState {
  x: number;
  y: number;
}

export interface KvStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const BALL_KEY = 'maidfish-survivor-float-v1';
export const SFX_KEY = 'maidfish-survivor-sfx-v1';
export const VIB_KEY = 'maidfish-survivor-vib-v1';

function memoryStore(): KvStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v); }
  };
}

function defaultStore(): KvStore {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch { /* 存储不可用/隐私模式 */ }
  return memoryStore();
}

export function loadBallState(store: KvStore = defaultStore()): FloatBallState {
  const fallback: FloatBallState = { x: 0, y: 0 };
  try {
    const raw = store.getItem(BALL_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<FloatBallState>;
    return {
      x: typeof p.x === 'number' ? p.x : 0,
      y: typeof p.y === 'number' ? p.y : 0
    };
  } catch {
    return fallback;   // 损坏数据重置，不崩
  }
}

export function saveBallState(s: FloatBallState, store: KvStore = defaultStore()): void {
  try {
    store.setItem(BALL_KEY, JSON.stringify(s));
  } catch {
    /* 存储不可用时静默 */
  }
}

// 音效开关持久化（audio.ts 调用，存同一个 SFX_KEY）
export function loadSfxEnabled(store: KvStore = defaultStore()): boolean {
  try { return store.getItem(SFX_KEY) !== 'off'; } catch { return true; }
}
export function saveSfxEnabled(v: boolean, store: KvStore = defaultStore()): void {
  try { store.setItem(SFX_KEY, v ? 'on' : 'off'); } catch { /* 静默 */ }
}
