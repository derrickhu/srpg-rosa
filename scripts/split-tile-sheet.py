#!/usr/bin/env python3
"""把品红底的图标/地形 sheet 切成一张张透明 PNG。

生图模型画格子的位置从来不精确，按名义网格等分切会削掉边缘。默认改成**按连通域找**：
抠掉品红之后取前景连通块，按行列排序，逐块裁包围盒。格子画歪了也不影响。

但连通域对**由多个分离部件组成的图标**是错的——「一张嘴 + 三道声波」会被数成 4 块，
一整张 sheet 的块数于是对不上名字数。这类 sheet 用 `--grid 3x3`：先按名义网格等分，
再在每格**内部**裁包围盒。等分只用来划定归属，不决定裁切边界，所以画歪一点也还能救；
真的歪到跨格才会出问题，那种图重生成更快。

抠像用色相判定而不是 RGB 距离——品红键色在压缩后会晕开成一圈紫，
单纯比距离要么留紫边要么啃掉素材的暖色。切完再跑 despill-magenta.py 清残留。

用法：
    python3 scripts/split-tile-sheet.py --input sheet.png --out-dir images/terrain \\
        --names high forest river swamp wall abyss --size 128
    python3 scripts/split-tile-sheet.py --input sheet.png --out-dir images/ui --grid 3x3 \\
        --names a b c d e f g h i --size 72
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


def key_mask(rgb: np.ndarray, threshold: int) -> np.ndarray:
    """返回前景掩码。

    「品红度」定义为 `min(r, b) - g`：品红的红蓝双高、绿被压到底，这个值接近 255；
    普通素材色都远低于它。用连续分数配一个阈值，比拿几个布尔条件硬拼更好调——
    紫色素材（魂晶水晶实测品红度最高 133，而键色底是 237~245）正是靠调这个阈值救回来的，
    否则整块紫会被判成背景抠掉。
    """
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    return (np.minimum(r, b) - g) <= threshold


def main() -> int:
    ap = argparse.ArgumentParser(description="品红底 sheet → 逐格透明 PNG")
    ap.add_argument("--input", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--names", nargs="+", required=True, help="按行优先顺序给每格命名")
    ap.add_argument("--size", type=int, default=128, help="输出长边像素")
    ap.add_argument("--min-area", type=int, default=2000, help="小于此面积的连通块视为噪点")
    ap.add_argument("--pad", type=int, default=2, help="包围盒外扩像素，留给抗锯齿边")
    ap.add_argument(
        "--grid",
        help="按 COLSxROWS 等分归属再逐格裁包围盒；图标由多个分离部件组成时用它",
    )
    ap.add_argument(
        "--key-threshold",
        type=int,
        default=170,
        help="品红度高于此值判为背景。素材里有紫/粉时先量一下再调（默认 170）",
    )
    args = ap.parse_args()

    src = Image.open(args.input).convert("RGB")
    rgb = np.array(src)
    fg = key_mask(rgb, args.key_threshold)
    # 闭运算把描边缝隙补上，免得一个素材裂成好几块
    fg = ndimage.binary_closing(fg, np.ones((7, 7)))
    # 找连通块时把内部的洞填上（齿轮的轴孔会把它切成两块），但**填洞的结果只用于分块**，
    # 不能拿去当 alpha——那样轴孔会被糊成不透明的品红。
    if args.grid:
        cols, rows_n = (int(v) for v in args.grid.lower().split("x"))
        if cols * rows_n != len(args.names):
            print(f"网格 {args.grid} 是 {cols * rows_n} 格，但给了 {len(args.names)} 个名字", file=sys.stderr)
            return 1
        H, W = fg.shape
        ordered = []
        for ri in range(rows_n):
            for ci in range(cols):
                cy0, cy1 = round(ri * H / rows_n), round((ri + 1) * H / rows_n)
                cx0, cx1 = round(ci * W / cols), round((ci + 1) * W / cols)
                ys, xs = np.nonzero(fg[cy0:cy1, cx0:cx1])
                if len(ys) == 0:
                    print(f"网格 ({ri},{ci}) 里没有前景像素", file=sys.stderr)
                    return 1
                ordered.append((cy0 + ys.min(), cy0 + ys.max() + 1, cx0 + xs.min(), cx0 + xs.max() + 1))
    else:
        lbl, n = ndimage.label(ndimage.binary_fill_holes(fg))
        boxes = []
        for i in range(1, n + 1):
            ys, xs = np.nonzero(lbl == i)
            if len(ys) < args.min_area:
                continue
            boxes.append((ys.min(), ys.max() + 1, xs.min(), xs.max() + 1))
        if len(boxes) != len(args.names):
            print(f"检出 {len(boxes)} 块，但给了 {len(args.names)} 个名字", file=sys.stderr)
            print("（图标由多个分离部件组成时改用 --grid COLSxROWS）", file=sys.stderr)
            for b in sorted(boxes):
                print("  ", b, file=sys.stderr)
            return 1

        # 行优先排序：先按行中心聚类成若干行，行内再按 x 排序
        boxes.sort(key=lambda b: (b[0] + b[1]) / 2)
        heights = [b[1] - b[0] for b in boxes]
        row_tol = max(heights) * 0.6
        rows: list[list] = []
        for b in boxes:
            cy = (b[0] + b[1]) / 2
            if rows and cy - (rows[-1][0][0] + rows[-1][0][1]) / 2 < row_tol:
                rows[-1].append(b)
            else:
                rows.append([b])
        ordered = [b for row in rows for b in sorted(row, key=lambda b: b[2])]

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    alpha_full = (fg * 255).astype(np.uint8)
    for name, (y0, y1, x0, x1) in zip(args.names, ordered):
        y0, x0 = max(0, y0 - args.pad), max(0, x0 - args.pad)
        y1, x1 = min(rgb.shape[0], y1 + args.pad), min(rgb.shape[1], x1 + args.pad)
        col = rgb[y0:y1, x0:x1].astype(np.float64)
        a = (alpha_full[y0:y1, x0:x1] / 255.0)[..., None]
        s = args.size / max(y1 - y0, x1 - x0)
        dw, dh = max(1, round((x1 - x0) * s)), max(1, round((y1 - y0) * s))
        # 预乘 alpha 再缩放。直接缩 RGBA 会把透明像素里残留的品红混进边缘，出一圈紫边。
        pm = Image.fromarray((col * a).astype(np.uint8), "RGB").resize((dw, dh), Image.LANCZOS)
        am = Image.fromarray((a[..., 0] * 255).astype(np.uint8), "L").resize((dw, dh), Image.LANCZOS)
        pmv, amv = np.array(pm).astype(np.float64), np.array(am).astype(np.float64)[..., None]
        out = np.clip(np.divide(pmv * 255, np.maximum(amv, 1)), 0, 255).astype(np.uint8)
        im = Image.fromarray(np.dstack([out, amv[..., 0].astype(np.uint8)]), "RGBA")
        dst = out_dir / f"{name}.png"
        im.save(dst)
        print(f"  {name:8s} {im.width}x{im.height}  → {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
