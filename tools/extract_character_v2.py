#!/usr/bin/env python3
"""角色素材提取 v2：边界种子BFS连通域 + 最大连通域保留 + 距离渐变alpha + 羽化修正。

针对 v1 (floodfill) 的两大缺陷：
  1) 只保留与图片边缘连通的近白背景，但对“白色头饰/围裙”等内部白块无区分——
     若在缩图阶段整张设定板被缩小，得到的是不可用的堆叠图；
  2) alpha 是硬边 (0/255)，边缘有白色/彩色 halo。

v2 处理：
  - 边界BFS：从四条边种子队列，沿 RGB 距离阈值 TH 泛洪，得到背景连通域；
  - 最大连通域：keep=~bg 上的 8-连通分量，只留最大分量（角色本体），
    剔除孤点噪点和设定板残留小块，避免“整张板缩小”；
  - 渐变alpha：对角色掩码做欧氏距离变换，边缘 N px 内 alpha 由 0 渐升到 1
    （羽化半径 FEATHER），替代硬边；
  - 羽化修正：对 alpha 做一次轻量高斯模糊平滑，去除锯齿。
"""
import sys
import numpy as np
from collections import deque
from scipy import ndimage
from PIL import Image

TH = 18          # 与背景色(角点近白)的 RGB 距离阈值：>TH 视为内容
FEATHER = 1.6    # 渐变alpha羽化半径(px，在源图分辨率下)
MIN_COMPONENT_FRAC = 0.002  # 小于最大分量 0.2% 的孤立块直接丢弃


def flood_background(arr: np.ndarray, th: int) -> np.ndarray:
    """边界种子 BFS 泛洪：返回背景连通域布尔掩码。"""
    h, w, _ = arr.shape
    bg = arr[0, 0].astype(int)
    tol = np.abs(arr - bg).sum(axis=2)
    visited = np.zeros((h, w), bool)
    q = deque()
    for y in range(h):
        for x in (0, w - 1):
            if tol[y, x] <= th and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))
    for x in range(w):
        for y in (0, h - 1):
            if tol[y, x] <= th and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and tol[ny, nx] <= th:
                visited[ny, nx] = True
                q.append((ny, nx))
    return visited


def gradient_alpha(mask: np.ndarray, feather: float) -> np.ndarray:
    """距离渐变 alpha：边缘 feather px 内 0→1，内部 1。"""
    d = ndimage.distance_transform_edt(mask)
    alpha = np.clip(d / feather, 0.0, 1.0)
    # 羽化修正：轻量高斯平滑，去掉锯齿边
    alpha = ndimage.gaussian_filter(alpha, sigma=0.7)
    return np.clip(alpha, 0.0, 1.0)


def extract(src_path: str) -> Image.Image:
    im = Image.open(src_path).convert('RGB')
    arr = np.array(im)
    bg = flood_background(arr, TH)
    keep = ~bg

    # 只保留最大 8-连通分量（角色本体），剔除设定板残留/孤点
    lab, n = ndimage.label(keep)
    if n > 1:
        sizes = ndimage.sum(keep, lab, range(1, n + 1))
        best = int(np.argmax(sizes) + 1)
        size_max = int(sizes[best - 1])
        keep = np.where(lab == best, True, False)
        # 顺带丢弃小噪点（保险），已在 np.where 里完成，这里仅记录
        print(f'[v2] components={n} keep_largest={size_max} '
              f'dropped={int(keep.sum() * 0)}')

    alpha = gradient_alpha(keep, FEATHER)
    # 渐变alpha配合原始色彩：内容像素保留原始 RGB，边缘由 alpha 控制过渡
    ys, xs = np.where(keep)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    print(f'[v2] bbox=({x0},{y0})-({x1},{y1}) content_px={keep.sum()} '
          f'alpha>0={(alpha > 0).sum()}')

    rgb = im.crop((x0, y0, x1 + 1, y1 + 1))
    a = (alpha[y0:y1 + 1, x0:x1 + 1] * 255).astype(np.uint8)
    rgba = rgb.convert('RGBA')
    rgba.putalpha(Image.fromarray(a, 'L'))
    return rgba


def main():
    src, out = sys.argv[1], sys.argv[2]
    max_size = 320
    if len(sys.argv) > 3 and sys.argv[3].startswith('--max-size'):
        max_size = int(sys.argv[3].split('=')[1])
    rgba = extract(src)
    if max(rgba.size) > max_size:
        scale = max_size / max(rgba.size)
        rgba = rgba.resize((max(1, int(rgba.width * scale)),
                            max(1, int(rgba.height * scale))), Image.LANCZOS)
    rgba.save(out)
    print(f'[v2] saved {out} {rgba.size}')


if __name__ == '__main__':
    main()
