#!/usr/bin/env python3
"""从色度键底（绿幕/洋红幕）的生图里抠出若干个独立物件，按从左到右切成单独的透明 PNG。

用在「一张图里画好几个同类道具」这种生图上（比如三支箭、三个攻城道具一次生出来）：
一次生图比三次生图更容易让它们**风格一致、比例可比**——分三次生，粗细和描边宽度必然对不上。

抠完会顺手做两件容易漏的事：
1. 去溢色。键色边缘会把键色渗进羽毛这类半透明处，不处理的话箭羽在游戏里发紫。
2. 按目标高度等比缩放。弹体贴图在运行时按 `sizePx / tex.width` 缩放，
   所以三支箭的**相对**长度必须在贴图里就是对的，不能靠运行时再调。

键色选哪个见 `chroma.py`：主体偏绿用洋红，主体偏暖用绿幕。

用法：
    python3 scripts/cutout-chroma.py raw.png --out-dir images/fx --key green \
        --names prop_torch prop_ram prop_banner --scale 0.5
"""

from __future__ import annotations

import argparse
import pathlib
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from chroma import CHROMA_KEYS, key_chroma, despill_chroma  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=pathlib.Path)
    ap.add_argument("--out-dir", type=pathlib.Path, required=True)
    ap.add_argument("--names", nargs="+", required=True, help="从左到右对应的输出名")
    ap.add_argument(
        "--key",
        choices=tuple(CHROMA_KEYS),
        default="magenta",
        help="键色。主体偏绿用 magenta，主体偏暖用 green",
    )
    ap.add_argument(
        "--scale",
        type=float,
        default=1.0,
        help="统一缩放系数。必须所有物件用**同一个**系数——它们是在同一张图里按同一比例画的，"
        "各自缩到同一高度会把相对粗细和长度一起改掉",
    )
    ap.add_argument("--tol", type=int, default=60)
    ap.add_argument("--min-area", type=int, default=400, help="小于这个面积的连通块当噪点丢掉")
    ap.add_argument(
        "--cuts",
        type=int,
        nargs="+",
        help="显式切位（x 像素），给 N-1 个把图切成 N 份。"
        "物件挨得近时列空间上没有全键色的分界列，自动分组必然失败——"
        "斜着画的火把和它右边的攻城槌就是这样连成一片的",
    )
    args = ap.parse_args()

    arr = np.array(Image.open(args.src).convert("RGB"))
    alpha = key_chroma(arr, args.key, args.tol)
    rgba = np.dstack([despill_chroma(arr, args.key), alpha])

    if args.cuts:
        bounds = [0, *sorted(args.cuts), arr.shape[1]]
        spans = [(bounds[i], bounds[i + 1] - 1) for i in range(len(bounds) - 1)]
    else:
        # 先按列合并：一支箭的箭头和箭羽之间可能被键色断开，逐块找会把一支箭切成两半。
        # 物件在图里是左右分开摆的，所以按「哪些列有内容」分组才对
        col_has = (alpha > 0).any(axis=0)
        labels, n = ndimage.label(col_has)
        spans = [
            (int(np.where(labels == i)[0].min()), int(np.where(labels == i)[0].max()))
            for i in range(1, n + 1)
        ]
    spans = [(a, b) for a, b in spans if (alpha[:, a : b + 1] > 0).sum() >= args.min_area]
    if len(spans) != len(args.names):
        print(f"找到 {len(spans)} 个物件，但给了 {len(args.names)} 个名字：{spans}")
        return 1

    args.out_dir.mkdir(parents=True, exist_ok=True)
    for (x0, x1), name in zip(spans, args.names):
        sub = rgba[:, x0 : x1 + 1].copy()
        # 丢掉切片里的小碎块。--cuts 从物件之间穿过时会带走邻居的一角
        # （斜着的火把被切在 x=421，一小片火焰落进了攻城槌的切片，还把它的左边界撑开），
        # 键色边缘的零星噪点也一起清掉
        lab, cnt = ndimage.label(sub[..., 3] > 0)
        if cnt > 1:
            areas = ndimage.sum(np.ones_like(lab), lab, range(1, cnt + 1))
            drop = [i for i, a in enumerate(areas, start=1) if a < args.min_area]
            if drop:
                sub[np.isin(lab, drop)] = 0
        # 行列都收紧。按列分组来的 span 本来就是紧的，但 --cuts 给的是任意切位
        rows = np.where((sub[..., 3] > 0).any(axis=1))[0]
        cols = np.where((sub[..., 3] > 0).any(axis=0))[0]
        sub = sub[rows.min() : rows.max() + 1, cols.min() : cols.max() + 1]
        im = Image.fromarray(sub, "RGBA")
        if args.scale != 1.0:
            im = im.resize(
                (max(1, round(im.width * args.scale)), max(1, round(im.height * args.scale))),
                Image.LANCZOS,
            )
        out = args.out_dir / f"{name}.png"
        im.save(out)
        print(f"  {name:22s} {im.width}x{im.height} -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
