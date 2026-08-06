#!/usr/bin/env python3
"""给挤满单元格的 AI sprite sheet 留出边距，供 generate2dsprite 严格 QC 通过。

生图模型很难稳定遵守"角色只占单元格 X%、四周留白"这类要求，经常把某几行画到贴边，
切帧时会削掉弓尖或脚底。重摇一次是抽奖，缩放是确定性的，所以做在这里。

关键约束：**所有单元格用同一个缩放系数，且各自绕自己的中心缩放**。这是一个对每格
完全相同的相似变换，帧与帧之间的大小、站位关系原样保留，不会破坏下游的
--shared-scale 与 --align feet。逐格各缩各的会让角色忽大忽小，绝对不要那样做。

    python3 scripts/respace-sheet.py --input raw.png --output spaced.png
    python3 scripts/respace-sheet.py --input raw.png --output spaced.png --margin 0.10
"""
import argparse
import sys

import numpy as np
from PIL import Image

MAGENTA = (255, 0, 255)


def subject_mask(arr: np.ndarray) -> np.ndarray:
    """品红键色以外的都算主体。阈值放宽以容忍生图的色边。"""
    r, g, b = arr[..., 0].astype(int), arr[..., 1].astype(int), arr[..., 2].astype(int)
    return ~((r > 150) & (b > 150) & (g < 130))


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument('--input', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--rows', type=int, default=4)
    p.add_argument('--cols', type=int, default=4)
    p.add_argument('--margin', type=float, default=0.08,
                   help='单元格每边至少留出的空白比例')
    a = p.parse_args()

    src = Image.open(a.input).convert('RGB')
    arr = np.array(src)
    H, W, _ = arr.shape
    ch, cw = H // a.rows, W // a.cols
    mask = subject_mask(arr)

    # 找出所有单元格里主体离格心最远的相对距离，据此定出唯一的缩放系数
    worst = 0.0
    for r in range(a.rows):
        for c in range(a.cols):
            cell = mask[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw]
            ys, xs = np.nonzero(cell)
            if not len(ys):
                continue
            dy = max(abs(ys.min() - ch / 2), abs(ys.max() + 1 - ch / 2)) / (ch / 2)
            dx = max(abs(xs.min() - cw / 2), abs(xs.max() + 1 - cw / 2)) / (cw / 2)
            worst = max(worst, dy, dx)

    scale = min(1.0, (1.0 - a.margin) / worst) if worst else 1.0
    print(f'最挤的单元格占到半格的 {worst:.3f}，统一缩放系数 {scale:.3f}')
    if scale >= 0.999:
        print('已有足够边距，原样复制')
        src.save(a.output)
        return 0

    out = Image.new('RGB', (W, H), MAGENTA)
    nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))
    for r in range(a.rows):
        for c in range(a.cols):
            cell = src.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            small = cell.resize((nw, nh), Image.LANCZOS)
            out.paste(small, (c * cw + (cw - nw) // 2, r * ch + (ch - nh) // 2))
    out.save(a.output)
    print(f'已写出 {a.output}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
