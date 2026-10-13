// 启动加载状态机（纯逻辑，可单测）：驱动 index.html 的加载覆盖层。
// 设计要点：
//  - 不依赖 Phaser/DOM，boot/load/ready/error 四态 + 进度 + 失败资产 key；
//  - 「超时兜底」是 UX 保护（页面卡死时给出提示），不是固定等待——资源加载完仍秒进菜单。
export type BootPhase = 'booting' | 'loading' | 'ready' | 'error';

export interface LoadState {
  phase: BootPhase;
  progress: number;      // 0..1，Phaser loader 上报的进度
  errorKeys: string[];   // 加载失败的资源 key（累计，去重）
}

export function initialState(): LoadState {
  return { phase: 'booting', progress: 0, errorKeys: [] };
}

// 上报资源加载进度：progress>=1 → ready；出现过 error 保持 error（不覆盖）
export function reportProgress(s: LoadState, p: number): LoadState {
  const progress = Math.max(0, Math.min(1, p));
  if (s.phase === 'error') return { ...s, progress };
  return { ...s, progress, phase: progress >= 1 ? 'ready' : 'loading' };
}

// 上报某个资源加载失败；错误去重累积
export function reportError(s: LoadState, key: string): LoadState {
  const errorKeys = s.errorKeys.includes(key) ? s.errorKeys : [...s.errorKeys, key];
  return { ...s, phase: 'error', errorKeys };
}

// 超时兜底：超过 timeoutMs 仍未 ready → 返回 true（调用方显示"加载慢/请重试"）。
// 这不是游戏逻辑的固定等待，只是加载覆盖层的 UX 保护。
export function shouldShowFallback(s: LoadState, elapsedMs: number, timeoutMs = 20000): boolean {
  return s.phase !== 'ready' && elapsedMs > timeoutMs;
}

// DOM 适配层接口：index.html 的覆盖层实现它，BootScene 调用（解耦 Phaser/DOM）
export interface LoadingApi {
  setProgress: (p: number) => void;
  ready: () => void;
  error: (key: string) => void;
}
