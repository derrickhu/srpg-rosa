#!/usr/bin/env python3
"""消除品红键色在角色轮廓上留下的紫色溢色边。

`generate2dsprite process` 用「到 #FF00FF 的色距」判断背景，边缘那些「品红 x 描边」
混合出来的像素色距太大删不掉，而把阈值提到能删掉它们时，浅色像素（骨白、皮毛高光）
的色距同样大，会被一起挖穿。阈值这个维度上不存在可行解。

改成不删而是校正：品红溢色的特征是红蓝双高、绿通道被压低，即 spill = min(r, b) - g > 0。
对本项目的角色配色（灰绿肤色、棕皮革、骨白、钢灰、血红）该判据不会误伤——这些颜色的
绿通道都不低于红蓝的较小值。把 r、b 压回 g，溢色像素就还原成中性的深色描边。

前提：角色配色里不能有粉/品红/紫罗兰/紫色，这些颜色会被判成溢色。prompt 里已明确禁止。
素材**必须**用紫时（魂晶水晶就是），用 `--min-spill` 抬高判定门槛：先量出素材本身的最高
品红度，再取一个高于它、低于键色底的值。魂晶那张实测素材 ≤133、键色底 237~245，取 140。

只处理已抠好底的透明帧。目录模式会跳过 raw-sheet.png：那是未抠色的原始生图，背景是纯品红
(255,0,255)，min(r,b)-g = 255 会被判成溢色而压成黑色，等于毁掉复现锚点。

用法：
    python3 scripts/despill-magenta.py art/sprite-runs/bloodfang/walk
    python3 scripts/despill-magenta.py <dir> --strength 1.0 --dry-run
"""

from __future__ import annotations

import argparse
import pathlib
import sys

import numpy as np
from PIL import Image

# alpha 低于此值的像素视作背景，不参与统计与校正
ALPHA_FLOOR = 16

# 未抠色的原始生图，背景仍是纯品红，绝不能 despill（会整片压成黑色）
SKIP_NAMES = {"raw-sheet.png"}


def despill(img: Image.Image, strength: float, min_spill: int) -> tuple[Image.Image, int, int]:
    a = np.array(img.convert("RGBA"))
    rgb = a[..., :3].astype(np.int16)
    alpha = a[..., 3]

    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    visible = alpha > ALPHA_FLOOR
    spill = np.minimum(r, b) - g
    hit = visible & (spill > min_spill)

    # r、b 按 strength 向 g 收敛；strength=1 时完全压平到 g（溢色变中性灰）
    delta = (spill * strength).astype(np.int16)
    rgb[..., 0] = np.where(hit, r - delta, r)
    rgb[..., 2] = np.where(hit, b - delta, b)

    a[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return Image.fromarray(a, "RGBA"), int(hit.sum()), int(visible.sum())


def main() -> int:
    ap = argparse.ArgumentParser(description="消除品红键色残留的紫色溢色边")
    ap.add_argument("target", help="帧目录，或单个 PNG 文件")
    ap.add_argument(
        "--strength",
        type=float,
        default=1.0,
        help="校正强度 0~1，1 表示把溢色完全压成中性色（默认 1.0）",
    )
    ap.add_argument(
        "--min-spill",
        type=int,
        default=0,
        help="品红度高于此值才算溢色。素材本身带紫时抬高它，否则紫色会被压成灰（默认 0）",
    )
    ap.add_argument("--dry-run", action="store_true", help="只统计不写回")
    args = ap.parse_args()

    target = pathlib.Path(args.target)
    if target.is_file():
        # 显式指定单个文件时不拦，调用方自己负责
        files = [target]
    else:
        files = [p for p in sorted(target.glob("*.png")) if p.name not in SKIP_NAMES]
    if not files:
        print(f"没有找到 PNG: {target}", file=sys.stderr)
        return 1

    total_hit = total_vis = 0
    for path in files:
        out, hit, vis = despill(Image.open(path), args.strength, args.min_spill)
        total_hit += hit
        total_vis += vis
        if not args.dry_run:
            out.save(path)
        pct = 100.0 * hit / vis if vis else 0.0
        print(f"  {path.name:<28} 溢色像素 {hit:>6} / 可见 {vis:>7} ({pct:.2f}%)")

    pct = 100.0 * total_hit / total_vis if total_vis else 0.0
    verb = "待校正" if args.dry_run else "已校正"
    print(f"{verb} {len(files)} 个文件，溢色像素合计 {total_hit} / {total_vis} ({pct:.2f}%)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
