#!/usr/bin/env python3
"""把单格补生成的主体缩放到和原批次同一个体型基准，供 generate2dsprite 的 profile QC 通过。

## 为什么需要这个

某一章四只杂兵原本是一张 2x2 一次生出来的，`--shared-scale` 保证四只等大。事后只想重做
其中一只时（比如 prompt 写错了），单格生图的主体占画面比例是随机的，接不上原批次——
管线的判据是 `body_scale = sqrt(主体面积 / 原图面积)`，也就是**主体在原图里占多大**，
所以它完全由生图构图决定，`--scale-profile` 只会把偏差报出来（`profile body-scale drift`），
不会替你修。偏了就表现为棋盘上这一只比同章另外三只明显大一圈或小一圈。

`respace-sheet.py` 解决不了：它是 `scale = min(1.0, ...)`，只会缩小、且目标是「留出边距」
而不是「对齐某个基准」。这里要的是双向缩放到一个精确的目标值。

## 做法

纯相似变换：绕**主体自身的包围盒中心**缩放，缩放后把中心挪回原位。不重新构图、不重新居中——
主体在画面里的位置原样保留，下游的 `--align feet` 和 profile 的 `output_origin` 照旧生效。

重摇一次生图是抽奖，缩放是确定性的，所以做在这里。相似变换下 `body_scale` 与缩放系数
**严格成正比**，所以「量一次、算一次、缩一次」就够，不需要迭代逼近。

## 用法：`--current-body-scale` 要传，别依赖内置估算

正确的三步是**先用管线量、再缩、再过严格 QC**：

    # 1. 不带 --strict-qc 跑一遍，读 qc_summary.body_scale_mean
    python3 .../generate2dsprite.py process --input raw-mob4.png ... --output-dir tmp/
    # 2. 用量到的真值缩放
    python3 scripts/rescale-subject.py --input raw-mob4.png --output raw-mob4-scaled.png \\
      --scale-profile art/sprite-runs/mobs-ch3/scale-profile.json --current-body-scale 0.4916
    # 3. 带 --strict-qc 重跑

不传 `--current-body-scale` 时会退化成本脚本自己按主体掩码估算，**这个估算对细长形状不可靠**：
管线算的是 `body_core_area`（躯干核心，会排除细肢），掩码面积算的是全部像素。紧凑的人形两者
接近，但一只举着巨钳、四条细腿横撑的蟹能差到 24%——照估算缩完 QC 反而更不过。踩过。
"""
import argparse
import json
import math
import sys

import numpy as np
from PIL import Image

MAGENTA = (255, 0, 255)


def subject_mask(arr: np.ndarray) -> np.ndarray:
    """品红键色以外的都算主体。阈值和 respace-sheet.py 保持一致，容忍生图的色边。"""
    r, g, b = arr[..., 0].astype(int), arr[..., 1].astype(int), arr[..., 2].astype(int)
    return ~((r > 150) & (b > 150) & (g < 130))


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument('--input', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--scale-profile', help='原批次的 scale-profile.json，取其 body_scale_mean 为目标')
    p.add_argument('--target-body-scale', type=float,
                   help='直接给目标 body_scale，和 --scale-profile 二选一')
    p.add_argument('--current-body-scale', type=float,
                   help='管线量到的当前 body_scale（qc_summary.body_scale_mean）。'
                        '强烈建议传：不传则按主体掩码估算，对细长形状不可靠，见模块文档')
    p.add_argument('--rows', type=int, default=1,
                   help='多格 sheet 的行数。>1 时每格绕自己的中心缩放，见模块文档')
    p.add_argument('--cols', type=int, default=1, help='多格 sheet 的列数')
    a = p.parse_args()

    if a.scale_profile:
        prof = json.load(open(a.scale_profile))
        target = float(prof['reference']['body_scale_mean'])
    elif a.target_body_scale:
        target = a.target_body_scale
    else:
        print('必须给 --scale-profile 或 --target-body-scale', file=sys.stderr)
        return 2

    src = Image.open(a.input).convert('RGB')
    arr = np.array(src)
    H, W, _ = arr.shape
    mask = subject_mask(arr)
    ys, xs = np.nonzero(mask)
    if not len(ys):
        print('图里找不到主体（整张都是键色？）', file=sys.stderr)
        return 1

    if a.current_body_scale:
        current = a.current_body_scale
        src_note = '管线实测'
    else:
        # 退化路径：按主体掩码估算。管线用的是 body_core_area（排除细肢），口径并不相同，
        # 细长形状会明显偏离——只在拿不到管线读数时凑合用。
        current = math.sqrt(mask.sum() / float(H * W))
        src_note = '掩码估算（不可靠）'
    scale = target / current
    print(f'当前 body_scale {current:.4f}（{src_note}）→ 目标 {target:.4f}，缩放系数 {scale:.4f}')

    if abs(scale - 1.0) < 0.005:
        print('已经对齐，原样复制')
        src.save(a.output)
        return 0

    out = Image.new('RGB', (W, H), MAGENTA)
    if a.rows > 1 or a.cols > 1:
        # 多格 sheet：**每格绕自己的中心**缩放。绕全图中心缩放会让偏心的格子朝中心
        # 聚拢或朝外散开，放大时直接把边角那几格顶出画面。对每格施加同一个系数、
        # 各自绕自己的中心，是对每格完全相同的相似变换，帧间大小与站位关系原样保留，
        # 不会破坏下游的 --shared-scale 与 --align feet（同 respace-sheet.py 的约束）。
        ch, cw = H // a.rows, W // a.cols
        nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))
        for r in range(a.rows):
            for c in range(a.cols):
                cell = src.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
                out.paste(cell.resize((nw, nh), Image.LANCZOS),
                          (c * cw + (cw - nw) // 2, r * ch + (ch - nh) // 2))
    else:
        cx, cy = (xs.min() + xs.max() + 1) / 2, (ys.min() + ys.max() + 1) / 2
        nw, nh = max(1, round(W * scale)), max(1, round(H * scale))
        resized = src.resize((nw, nh), Image.LANCZOS)
        # 绕主体包围盒中心缩放：缩放后该中心跑到了 (cx*scale, cy*scale)，平移回 (cx, cy)
        out.paste(resized, (round(cx - cx * scale), round(cy - cy * scale)))

    # 贴边要**逐格**检查：多格 sheet 里主体贴的是自己那格的格线，全图包围盒看不出来
    new_mask = subject_mask(np.array(out))
    ch, cw = H // a.rows, W // a.cols
    touched = []
    for r in range(a.rows):
        for c in range(a.cols):
            cell = new_mask[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw]
            cys, cxs = np.nonzero(cell)
            if not len(cys):
                continue
            if cxs.min() <= 0 or cys.min() <= 0 or cxs.max() >= cw - 1 or cys.max() >= ch - 1:
                touched.append([r, c])
    # body_scale 的权威读数在管线那边，回去带 --strict-qc 重跑一次才算过
    print(f'缩放后逐格检查完毕（{a.rows}x{a.cols}）')
    if touched:
        # 放大到贴边说明这张生图留白本来就不够，缩放救不回来，得重摇构图
        print(f'这些格贴边了 {touched}，切帧会削掉肢体——重新生图，不要将就', file=sys.stderr)
        return 1

    out.save(a.output)
    print(f'已写出 {a.output}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
