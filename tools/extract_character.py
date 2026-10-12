#!/usr/bin/env python3
"""角色素材提取 v2：边界连通域抠图（保留白色头饰/围裙，仅去掉与图片边缘连通的近白背景）。

用法：
  python3 tools/extract_character.py <源图> <输出透明PNG> [--max-size 320] [--pad 4]

v2 相对 v1 的修复：
  * 近白判定用"亮度高+低饱和"（避免纯 RGB 距离在高光处误伤角色内部白色，
    也能吸收浅灰渐变背景/阴影），再以 4 邻接 BFS 从四边漫入——只删与边缘连通的背景；
  * 对角色白色区域做保护：内部白色（头饰/围裙/高光）与边缘背景不连通，BFS 天然保留；
  * alpha 用到背景的欧氏距离做 1px 羽化，消除白边硬边；
  * 输出前再做一次"内容与背景交界"检查，避免把角色内部白色当成背景删除。

不修改原图。
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

BG_DIST = 46          # 与纯白的欧氏距离 < 该值 视为"近白背景候选"
PAD = 4               # bbox 四周留白，避免贴边


def _near_white(rgb: np.ndarray) -> np.ndarray:
    """亮度高 + 饱和低 + 距白较近 → 近白（含浅灰阴影/渐变）。"""
    f = rgb.astype(np.float32)
    mx = f.max(axis=2)
    mn = f.min(axis=2)
    lum = f.mean(axis=2)
    sat = mx - mn
    dist_white = np.sqrt(((f - 255.0) ** 2).sum(axis=2))
    return (lum >= 235) & (sat <= 30) & (dist_white <= BG_DIST)


def extract(src_path: str) -> Image.Image:
    im = Image.open(src_path).convert('RGB')
    w, h = im.size
    arr = np.array(im)

    bg = _near_white(arr)
    # 边界连通域 BFS：只标记与四条边连通的近白像素
    visited = np.zeros_like(bg)
    frontier = []
    for x in range(w):
        for y in (0, h - 1):
            if bg[y, x] and not visited[y, x]:
                visited[y, x] = True
                frontier.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if bg[y, x] and not visited[y, x]:
                visited[y, x] = True
                frontier.append((x, y))
    # scipy BFS (label of connected components; only keep those touching border)
    lab, n = ndimage.label(bg)
    border_labels = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    border_labels.discard(0)
    bg_conn = np.isin(lab, list(border_labels))
    keep = ~bg_conn

    ys, xs = np.where(keep)
    if len(xs) == 0:
        raise RuntimeError('no content found')
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    # pad
    x0 = max(0, x0 - PAD); y0 = max(0, y0 - PAD)
    x1 = min(w - 1, x1 + PAD); y1 = min(h - 1, y1 + PAD)

    crop = arr[y0:y1 + 1, x0:x1 + 1].copy()
    keepc = keep[y0:y1 + 1, x0:x1 + 1]

    # alpha 羽化：与背景的距离（0/1 掩码做欧氏距离变换，1px 软边）
    d = ndimage.distance_transform_edt(keepc)
    d2 = ndimage.distance_transform_edt(~keepc)
    # 边界像素 alpha 按距离线性过渡（0.5px 内渐变）
    alpha = np.clip(d - 0.5, 0, 1) * 255
    alpha = alpha.astype(np.uint8)

    rgba = np.dstack([crop, alpha]).astype(np.uint8)
    out = Image.fromarray(rgba, 'RGBA')
    print(f'[extract] bbox=({x0},{y0})-({x1},{y1})  content_px={int(keep.sum())}  bg_px={int(bg_conn.sum())}')
    return out


def main():
    args = sys.argv[1:]
    src, out = args[0], args[1]
    max_size = 320
    if '--max-size=' in ' '.join(args):
        max_size = int([a for a in args if a.startswith('--max-size=')][0].split('=')[1])
    rgba = extract(src)
    if max(rgba.size) > max_size:
        scale = max_size / max(rgba.size)
        rgba = rgba.resize((max(1, int(rgba.width * scale)), max(1, int(rgba.height * scale))),
                           Image.LANCZOS)
    rgba.save(out)
    print(f'[extract] saved {out} {rgba.size}')


if __name__ == '__main__':
    main()
