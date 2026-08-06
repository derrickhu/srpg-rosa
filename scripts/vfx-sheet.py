#!/usr/bin/env python3
"""把黑底 additive 特效网格图切成逐帧 PNG，产出 sprite2anim 能直接吃的目录。

角色走的是品红抠色 + generate2dsprite；特效不能走那条路：additive 混合靠「黑色即透明」，
背景必须是纯黑，而抠色管线会把黑色描边一起吃掉。所以这里单独处理。

与 game-vfx-pipeline 的 process_vfx_frames.py 的关键区别：**所有帧共用一个缩放系数**。
那个脚本对每帧独立求 bbox 再缩放填满画布，用在扩散型特效（冲击波、爆炸）上会把「环在变大」
这个信息整个抹掉——第 1 帧的小环和最后一帧的大环都被放大到同样大小，动画看起来就是在原地闪。
这里用全部帧亮区并集决定唯一的裁剪边长，扩散过程才保得住。

裁剪窗口的位置则**按每帧自身亮区质心对齐**：生图很难把每格的效果画在同一个中心上，若用固定
窗口，各帧的偏移会让播放时整个特效左右抖。质心对齐只挪窗口不改边长，因此不影响半径增长。

输出与 generate2dsprite process 对齐（逐帧 PNG + pipeline-meta.json），
好让 scripts/sprite2anim.mjs 的清单契约保持单一。

用法：
    python3 scripts/vfx-sheet.py .tmp-gen/roar_raw.png \\
      --out-dir art/vfx-runs/roar --rows 2 --cols 3 --label roar
"""

from __future__ import annotations

import argparse
import json
import pathlib

import numpy as np
from PIL import Image

# 亮度低于此值视作背景黑，压成纯黑；生图的「黑」通常是 #050508 这类非纯黑
DEFAULT_THRESHOLD = 22
# 统一裁剪框四周留白，避免把外缘辉光切齐边
BBOX_PAD = 8


def crush_black(a: np.ndarray, threshold: int) -> np.ndarray:
    """把接近黑的像素压成纯黑，其余不动。additive 下纯黑才完全不可见。"""
    out = a.copy()
    dark = out[..., :3].max(axis=-1) <= threshold
    out[dark, 0:3] = 0
    out[..., 3] = 255
    return out


def content_bbox(a: np.ndarray, threshold: int) -> tuple[int, int, int, int] | None:
    lit = a[..., :3].max(axis=-1) > threshold
    if not lit.any():
        return None
    ys, xs = np.where(lit)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def lit_centroid(a: np.ndarray, threshold: int) -> tuple[int, int] | None:
    """亮度加权质心。环形效果的质心即环心，比 bbox 中心更抗单侧尖刺的干扰。"""
    lum = a[..., :3].max(axis=-1).astype(float)
    lum[lum <= threshold] = 0.0
    total = lum.sum()
    if total <= 0:
        return None
    ys, xs = np.indices(lum.shape)
    return int(round((xs * lum).sum() / total)), int(round((ys * lum).sum() / total))


def main() -> int:
    ap = argparse.ArgumentParser(description="黑底 additive 特效网格图 → 逐帧 PNG")
    ap.add_argument("input", type=pathlib.Path)
    ap.add_argument("--out-dir", type=pathlib.Path, required=True)
    ap.add_argument("--rows", type=int, required=True)
    ap.add_argument("--cols", type=int, required=True)
    ap.add_argument("--label", required=True, help="帧标签前缀，如 roar → roar-1..roar-N")
    ap.add_argument("--count", type=int, help="只取前 N 帧（默认 rows*cols）")
    ap.add_argument("--size", type=int, default=256, help="输出帧边长（默认 256，与 slash 一致）")
    ap.add_argument("--threshold", type=int, default=DEFAULT_THRESHOLD)
    args = ap.parse_args()

    sheet = np.array(Image.open(args.input).convert("RGBA")).astype(np.uint8)
    sh, sw = sheet.shape[0], sheet.shape[1]
    cw, ch = sw // args.cols, sh // args.rows
    count = args.count or args.rows * args.cols

    cells: list[np.ndarray] = []
    for r in range(args.rows):
        for c in range(args.cols):
            if len(cells) >= count:
                break
            cells.append(crush_black(sheet[r * ch : (r + 1) * ch, c * cw : (c + 1) * cw], args.threshold))

    boxes = [b for b in (content_bbox(c, args.threshold) for c in cells) if b is not None]
    if not boxes:
        print("所有帧都是全黑，检查生成图")
        return 1
    # 统一裁剪边长：取最大帧的亮区尺寸，保证最大的环不被切掉。正方形是必须的，
    # 否则非等比缩放会把圆环压成椭圆。
    side = min(
        max(max(b[2] - b[0], b[3] - b[1]) for b in boxes) + 2 * BBOX_PAD,
        cw,
        ch,
    )

    args.out_dir.mkdir(parents=True, exist_ok=True)
    # 与角色管线一致，把原始生图留在产物目录当复现锚点
    Image.open(args.input).convert("RGBA").save(args.out_dir / "raw-sheet.png")
    labels = []
    empty = []
    offsets = []
    for i, cell in enumerate(cells, start=1):
        c = lit_centroid(cell, args.threshold) or (cw // 2, ch // 2)
        x0 = max(0, min(cw - side, c[0] - side // 2))
        y0 = max(0, min(ch - side, c[1] - side // 2))
        offsets.append({"x": x0, "y": y0})
        crop = cell[y0 : y0 + side, x0 : x0 + side]
        img = Image.fromarray(crop, "RGBA").resize((args.size, args.size), Image.LANCZOS)
        label = f"{args.label}-{i}"
        img.save(args.out_dir / f"{label}.png")
        labels.append(label)
        lit = (np.array(img)[..., :3].max(axis=-1) > args.threshold).mean()
        if lit < 0.001:
            empty.append(label)
        print(f"  {label}.png  亮区占比 {lit:5.2%}  质心 ({c[0]:3d},{c[1]:3d})")

    Image.fromarray(
        np.concatenate(
            [np.array(Image.open(args.out_dir / f"{l}.png").convert("RGBA")) for l in labels], axis=1
        ),
        "RGBA",
    ).save(args.out_dir / f"{args.label}-strip.png")

    (args.out_dir / "pipeline-meta.json").write_text(
        json.dumps(
            {
                "source": "scripts/vfx-sheet.py",
                "input": str(args.input),
                "target": "vfx",
                "mode": "vfx_sheet",
                "rows": args.rows,
                "cols": args.cols,
                "cell_size": args.size,
                "threshold": args.threshold,
                "frame_labels": labels,
                "shared_crop_side": side,
                "crop_offsets": offsets,
                "empty_frames": empty,
                # sprite2anim 的 reportRunQc 会读这几项；特效没有「体型一致性」概念，填 0 表示不适用
                "qc_summary": {"body_scale_cv": 0.0, "anchor_y_std": 0.0},
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    print(f"共用裁剪边长 side={side}，逐帧按质心对齐（原始 cell {cw}x{ch}）-> {args.out_dir}")
    if empty:
        print(f"⚠ 全黑帧: {empty}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
