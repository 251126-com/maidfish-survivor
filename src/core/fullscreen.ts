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

export type FsRequest = 'ok' | 'pending' | 'unsupported';

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
