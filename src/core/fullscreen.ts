// 全屏适配（纯能力/状态逻辑，可单测）：
//  - 桌面：F11 浏览器原生 + 按钮调 Fullscreen API（documentElement 或 canvas 均可）
//  - Android：调用 Fullscreen API 全屏（进入/退出）
//  - iOS Safari：不支持元素级全屏（video 除外）→ 调用方给出轻量提示（toast）
// Phaser 侧在 main.ts 接入：fullscreenchange 时 game.scale.refresh() 重算 FIT 布局。
export type FullscreenKind = 'desktop' | 'android' | 'ios' | 'other';

export function uaKind(ua: string): FullscreenKind {
  const ios = /iPhone|iPad|iPod/.test(ua) && !/Windows Phone/.test(ua);
  if (ios) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Macintosh|Windows|Linux|CrOS/.test(ua)) return 'desktop';
  return 'other';
}

/** 该平台是否支持「任意元素」进入全屏（iOS 仅 video 支持 → false） */
export function elementFullscreenSupported(kind: FullscreenKind): boolean {
  return kind !== 'ios';
}

export function isFullscreen(
  doc?: Document & { webkitFullscreenElement?: Element | null }
): boolean {
  const d = doc ?? document;
  const wd = d as Document & { webkitFullscreenElement?: Element | null };
  return !!(d.fullscreenElement || wd.webkitFullscreenElement);
}

export type FsRequest = 'ok' | 'pending' | 'unsupported' | 'failed';

export function requestFullscreen(
  el: Element | null,
  kind: FullscreenKind
): FsRequest {
  if (!elementFullscreenSupported(kind)) return 'unsupported';
  if (!el) return 'unsupported';
  const e = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  if (typeof e.requestFullscreen === 'function') {
    const p = e.requestFullscreen();
    if (p && typeof (p as Promise<void>).catch === 'function') {
      (p as Promise<void>).catch(() => {});
    }
    return 'ok';
  }
  if (typeof e.webkitRequestFullscreen === 'function') {
    void e.webkitRequestFullscreen();
    return 'ok';
  }
  return 'pending';
}

/**
 * v0.9.1: 全屏请求的真实结果（Promise 级）。
 * 同步版 requestFullscreen 只能返回「已发起」；浏览器可能在随后拒绝请求，
 * 这里把 resolve→ok / reject→failed 真正返回给调用方（UI 可提示"全屏失败"）。
 */
export function requestFullscreenAsync(
  el: Element | null,
  kind: FullscreenKind
): Promise<FsRequest> {
  if (!elementFullscreenSupported(kind) || !el) return Promise.resolve('unsupported');
  const e = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  try {
    if (typeof e.requestFullscreen === 'function') {
      return Promise.resolve(e.requestFullscreen())
        .then(() => 'ok' as FsRequest)
        .catch(() => 'failed' as FsRequest);
    }
    if (typeof e.webkitRequestFullscreen === 'function') {
      const p = e.webkitRequestFullscreen();
      if (p && typeof (p as Promise<void>).then === 'function') {
        return (p as Promise<void>)
          .then(() => 'ok' as FsRequest)
          .catch(() => 'failed' as FsRequest);
      }
      return Promise.resolve('pending');
    }
  } catch {
    return Promise.resolve('failed');   // 同步抛错同样视为失败
  }
  return Promise.resolve('pending');
}

export function exitFullscreen(
  doc?: Document & { webkitExitFullscreen?: () => Promise<void> | void }
): void {
  const d = doc ?? document;
  const wd = d as Document & { webkitExitFullscreen?: () => Promise<void> | void };
  if (typeof d.exitFullscreen === 'function') {
    const p = d.exitFullscreen();
    if (p && typeof (p as Promise<void>).catch === 'function') {
      (p as Promise<void>).catch(() => {});
    }
  } else if (typeof wd.webkitExitFullscreen === 'function') {
    void wd.webkitExitFullscreen();
  }
}

/** 切换：返回本次操作结果（供 UI 显示 toast/更新按钮） */
export function toggleFullscreen(
  el: Element | null,
  kind: FullscreenKind,
  doc?: Document & { webkitFullscreenElement?: Element | null }
): FsRequest {
  if (isFullscreen(doc)) {
    exitFullscreen(doc);
    return 'ok';
  }
  return requestFullscreen(el, kind);
}
