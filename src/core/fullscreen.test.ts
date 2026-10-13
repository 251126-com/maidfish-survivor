import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uaKind, elementFullscreenSupported, isFullscreen, toggleFullscreen, requestFullscreen } from './fullscreen.ts';
import type { FsRequest } from './fullscreen.ts';

test('uaKind 平台识别', () => {
  assert.equal(uaKind('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'ios');
  assert.equal(uaKind('Mozilla/5.0 (iPad; CPU OS 17_0)'), 'ios');
  assert.equal(uaKind('Mozilla/5.0 (Linux; Android 13; Pixel 7)'), 'android');
  assert.equal(uaKind('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'desktop');
  assert.equal(uaKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'desktop');
});

test('iOS 不支持元素全屏，其他平台支持', () => {
  assert.equal(elementFullscreenSupported('ios'), false);
  assert.equal(elementFullscreenSupported('android'), true);
  assert.equal(elementFullscreenSupported('desktop'), true);
});

test('isFullscreen 读取 fullscreenElement', () => {
  const fake: any = { fullscreenElement: null, webkitFullscreenElement: null };
  assert.equal(isFullscreen(fake), false);
  fake.fullscreenElement = {};
  assert.equal(isFullscreen(fake), true);
  const fake2: any = { fullscreenElement: null, webkitFullscreenElement: {} };
  assert.equal(isFullscreen(fake2), true);
});

test('iOS 上 requestFullscreen 返回 unsupported（轻提示用）', () => {
  const el: any = { requestFullscreen: () => { throw new Error('不应被调用'); } };
  assert.equal(requestFullscreen(el, 'ios'), 'unsupported');
  // 空元素也不应进入全屏
  assert.equal(requestFullscreen(null, 'desktop'), 'unsupported');
});

test('desktop 上 requestFullscreen 调用 el.requestFullscreen', () => {
  let called = 0;
  const el: any = { requestFullscreen: () => { called++; return Promise.resolve(); } };
  const r = requestFullscreen(el, 'desktop');
  assert.equal(r, 'ok');
  assert.equal(called, 1);
});

test('切换：全屏中→退出，否则→进入', () => {
  let enter = 0, exit = 0;
  const el: any = { requestFullscreen: () => { enter++; return Promise.resolve(); } };
  const doc: any = { fullscreenElement: null, exitFullscreen: () => { exit++; return Promise.resolve(); } };
  let r: FsRequest = toggleFullscreen(el, 'desktop', doc);
  assert.equal(r, 'ok');
  assert.equal(enter, 1);
  doc.fullscreenElement = {};
  r = toggleFullscreen(el, 'desktop', doc);
  assert.equal(exit, 1);
  // iOS 全屏中 → 仍可退出
  r = toggleFullscreen(el, 'ios', doc);
  assert.equal(r, 'ok');
  assert.equal(exit, 2);
});

// ---------- v0.9.1: 全屏 Promise 真实失败返回 ----------
import { requestFullscreenAsync } from './fullscreen.ts';

test('requestFullscreenAsync: resolve → ok（真实进入全屏）', async () => {
  const el: any = { requestFullscreen: () => Promise.resolve() };
  assert.equal(await requestFullscreenAsync(el, 'desktop'), 'ok');
});

test('requestFullscreenAsync: reject → failed（浏览器拒绝全屏）', async () => {
  const el: any = { requestFullscreen: () => Promise.reject(new Error('denied')) };
  assert.equal(await requestFullscreenAsync(el, 'desktop'), 'failed');
});

test('requestFullscreenAsync: 同步抛错同样回 failed', async () => {
  const el: any = { requestFullscreen: () => { throw new Error('sync-err'); } };
  assert.equal(await requestFullscreenAsync(el, 'desktop'), 'failed');
});

test('requestFullscreenAsync: 不支持(空元素/iOS) → unsupported', async () => {
  const el: any = { requestFullscreen: () => Promise.resolve() };
  assert.equal(await requestFullscreenAsync(null, 'desktop'), 'unsupported');
  assert.equal(await requestFullscreenAsync(el, 'ios'), 'unsupported');
});

test('requestFullscreenAsync: 无方法 → pending', async () => {
  assert.equal(await requestFullscreenAsync({} as any, 'desktop'), 'pending');
});
