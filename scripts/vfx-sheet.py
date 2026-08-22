#!/usr/bin/env python3
"""把黑底 additive 特效网格图切成逐帧 PNG，产出 sprite2anim 能直接吃的目录。

角色走的是品红抠色 + generate2dsprite；特效不能走那条路：additive 混合靠「黑色即透明」，
背景必须是纯黑，而抠色管线会把黑色描边一起吃掉。所以这里单独处理。

与 game-vfx-pipeline 的 process_vfx_frames.py 的关键区别：**所有帧共用一个缩放系数**。
那个脚本对每帧独立求 bbox 再缩放填满画布，用在扩散型特效（冲击波、爆炸）上会把「环在变大」
这个信息整个抹掉——第 1 帧的小环和最后一帧的大环都被放大到同样大小，动画看起来就是在原地闪。
这里用全部帧亮区并集决定唯一的裁剪边长，扩散过程才保得住。

裁剪窗口的位置默认**按每帧自身亮区质心对齐**：生图很难把每格的效果画在同一个中心上，若用固定
窗口，各帧的偏移会让播放时整个特效左右抖。质心对齐只挪窗口不改边长，因此不影响半径增长。

但质心对齐对**严格同心**的效果是反作用：同心环的真中心恒在格心，而尾帧单侧先暗下去会把质心
拉走，跟着质心裁窗口等于让环朝反方向平移——本该原地推开的冲击波会一边扩一边往下坠。
这类效果用 `--align center` 固定按格心裁，把「居中」这件事交给 prompt 保证（见
docs/prompt/vfx/shield_wall.md 的 ABSOLUTE RULE 4）。默认仍是 centroid，避免动到已产出的图集。

第三类是**羽流型**：一个位置固定的亮核 + 一丛伸缩幅度很大的火舌/羽流（`ember_splat` 的
火球溅射就是）。它的锚点是亮核，而亮区质心会被火舌拖着走——实测溅射的质心在 341px 的
窗口里上下摆了 108px（32%），跟着裁窗口播出来是火球在人身上原地滑动。这类用
`--align core`，按白核定位。

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
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from chroma import CHROMA_KEYS, prep_chroma  # noqa: E402

# 亮度低于此值视作背景黑，压成纯黑；生图的「黑」通常是 #050508 这类非纯黑
DEFAULT_THRESHOLD = 22
# 统一裁剪框四周留白，避免把外缘辉光切齐边
BBOX_PAD = 8
# 战场草地色，抠图条图压在它上面看才是游戏里的样子
GRASS_RGB = (202, 225, 54)


def crush_black(a: np.ndarray, threshold: int) -> np.ndarray:
    """把接近黑的像素压成纯黑，其余不动。additive 下纯黑才完全不可见。"""
    out = a.copy()
    dark = out[..., :3].max(axis=-1) <= threshold
    out[dark, 0:3] = 0
    out[..., 3] = 255
    return out


def bake_alpha(a: np.ndarray, gamma: float) -> np.ndarray:
    """把亮度烘进 alpha 通道，让特效能用**普通混合**遮住背景。

    为什么必须这么做：战场草地是 RGB(202,225,54)，绿通道已经 225/255。
    纯 additive 叠上去只能往 255 推，于是中间调和暗部——也就是形状与质感的全部信息——
    在屏幕上一起消失，每个特效都退化成它最亮的那一团。实测下来赤焰的红整个不见了、
    银白的盾墙叠成黄绿色、青蓝的符印变成苍白薄荷，《特效圣经》§4.1
    「一族一色相」在游戏里其实从没生效过。

    alpha 有了之后，普通混合那一层才能把暗部**压**到草地上（变暗 = 有体积），
    additive 只留一层弱的做光溢出。gamma > 1 压低暗部覆盖度：近黑像素贴上去
    只会糊一圈脏边，不是想要的接触阴影。

    RGB 保持不动（直通 alpha，不预乘）——Pixi 上传纹理时自己会预乘。
    """
    out = a.copy()
    lum = out[..., :3].max(axis=-1).astype(float) / 255.0
    out[..., 3] = np.clip(np.power(lum, gamma) * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return out


def crop_centered(cell: np.ndarray, cx: int, cy: int, side: int) -> tuple[np.ndarray, int, int]:
    """以 (cx,cy) 为心裁 side 边长的正方窗口，越界部分补纯黑。

    补黑而不是把窗口夹回格内，是因为夹边会**悄悄取消对齐**：`ember_splat` 的生图把
    火焰底部画在格子偏下的位置，前三帧想要的窗口伸到格子下沿之外，一夹全部贴到同一条
    下边界，白核在输出帧里的位置于是从 0.63 跳到 0.50——正是对齐本该消掉的那种跳。
    窗口外本来就是黑（additive 下不可见、烘完 alpha 全透明），补黑不花任何代价。
    """
    h, w = cell.shape[:2]
    # 补出来的边是**全透明**（RGB 0 / alpha 0），两种键底都对：
    # 黑底 additive 下 RGB 为黑本就不可见，抠图下 alpha 0 才不会留黑边。
    # 早先这里跟着 crush_black 的约定填了 alpha=255，黑底模式靠随后的 bake_alpha
    # 归零所以看不出问题，洋红模式不烘 alpha，补边就变成一圈实心黑条。
    out = np.zeros((side, side, 4), dtype=cell.dtype)
    x0, y0 = cx - side // 2, cy - side // 2
    sx0, sy0 = max(0, x0), max(0, y0)
    sx1, sy1 = min(w, x0 + side), min(h, y0 + side)
    if sx1 > sx0 and sy1 > sy0:
        out[sy0 - y0 : sy1 - y0, sx0 - x0 : sx1 - x0] = cell[sy0:sy1, sx0:sx1]
    return out, x0, y0


def content_weight(a: np.ndarray, threshold: int, chroma: bool) -> np.ndarray:
    """「哪里有内容、有多少」的权重图。取景逻辑一律走它，两种键底才共用同一套代码。

    黑底 additive 用亮度（暗即无内容），洋红抠图用 alpha（键控已经判过了）。
    """
    if chroma:
        return a[..., 3].astype(float)
    lum = a[..., :3].max(axis=-1).astype(float)
    lum[lum <= threshold] = 0.0
    return lum


def content_bbox(w: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.where(w > 0)
    if xs.size == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def lit_centroid(w: np.ndarray) -> tuple[int, int] | None:
    """内容加权质心。环形效果的质心即环心，比 bbox 中心更抗单侧尖刺的干扰。"""
    total = w.sum()
    if total <= 0:
        return None
    ys, xs = np.indices(w.shape)
    return int(round((xs * w).sum() / total)), int(round((ys * w).sum() / total))


def core_centroid(a: np.ndarray) -> tuple[int, int] | None:
    """白核的加权质心。羽流型效果（溅射、火苗）的锚点在这里，不在亮区质心。

    判据是 **min(R,G,B)**，也就是消色差分量：白核是画面里唯一不饱和的地方，
    饱和的焰身/环身在它最弱的那个通道上必然低。用亮度不行——焰身一样亮；
    用蓝通道只对暖色系成立，青蓝色系的效果整幅蓝都高。

    阈值取本帧消色差最大值的一半，跟着每帧的衰减自动放宽，不然尾帧核一暗就找不到了。
    """
    ach = a[..., :3].min(axis=-1).astype(float)
    peak = ach.max()
    if peak <= 0:
        return None
    ach[ach < max(40.0, peak * 0.5)] = 0.0
    total = ach.sum()
    if total <= 0:
        return None
    ys, xs = np.indices(ach.shape)
    return int(round((xs * ach).sum() / total)), int(round((ys * ach).sum() / total))


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
    ap.add_argument(
        "--alpha-gamma",
        type=float,
        default=2.0,
        help="按亮度^gamma 烘 alpha（默认 2.0）。0 表示不烘、alpha 全 255（旧行为，纯 additive）",
    )
    ap.add_argument(
        "--align",
        choices=("centroid", "center", "core"),
        default="centroid",
        help=(
            "裁剪窗口对齐方式：centroid 逐帧质心（默认，抗生图偏移）/ "
            "center 固定格心（同心环用）/ core 逐帧白核（羽流型用）"
        ),
    )
    ap.add_argument(
        "--key",
        choices=("black", *CHROMA_KEYS),
        default="black",
        help=(
            "键底：black 黑底 additive（默认）/ magenta 洋红抠图（主体偏绿时）/ "
            "green 绿幕抠图（主体偏暖时）。键色要挑主体里没有的色相"
        ),
    )
    ap.add_argument("--tol", type=int, default=60, help="色度键控容差（抠图模式生效）")
    args = ap.parse_args()

    chroma = args.key != "black"
    sheet = np.array(Image.open(args.input).convert("RGBA")).astype(np.uint8)
    sh, sw = sheet.shape[0], sheet.shape[1]
    cw, ch = sw // args.cols, sh // args.rows
    count = args.count or args.rows * args.cols

    cells: list[np.ndarray] = []
    for r in range(args.rows):
        for c in range(args.cols):
            if len(cells) >= count:
                break
            raw = sheet[r * ch : (r + 1) * ch, c * cw : (c + 1) * cw]
            cells.append(prep_chroma(raw, args.key, args.tol) if chroma else crush_black(raw, args.threshold))

    weights = [content_weight(c, args.threshold, chroma) for c in cells]
    boxes = [b for b in (content_bbox(w) for w in weights) if b is not None]
    if not boxes:
        print("所有帧都是空的，检查生成图和键底")
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
    last_core: tuple[int, int] | None = None
    for i, (cell, w) in enumerate(zip(cells, weights), start=1):
        if args.align == "center":
            c = (cw // 2, ch // 2)
        elif args.align == "core":
            # 尾帧核已经烧没了，找不到就沿用上一帧的位置：这时候屏幕上只剩几点余烬，
            # 退回质心会让它们整体跳一下，而那一跳比余烬本身显眼
            found = core_centroid(cell)
            if found is not None:
                last_core = found
            c = found or last_core or lit_centroid(w) or (cw // 2, ch // 2)
        else:
            c = lit_centroid(w) or (cw // 2, ch // 2)
        crop, x0, y0 = crop_centered(cell, c[0], c[1], side)
        offsets.append({"x": x0, "y": y0})
        img = Image.fromarray(crop, "RGBA").resize((args.size, args.size), Image.LANCZOS)
        # 烘 alpha 放在缩放**之后**：先缩 RGB 再按缩完的亮度求 alpha，两者天然一致；
        # 反过来做会让 LANCZOS 分别重采样 RGB 和 alpha，边缘对不齐。
        # 洋红抠图不烘：它的 alpha 来自键控，按亮度重算会把蜜蜂的黑条纹抹成透明
        if args.alpha_gamma > 0 and not chroma:
            img = Image.fromarray(bake_alpha(np.array(img), args.alpha_gamma), "RGBA")
        label = f"{args.label}-{i}"
        img.save(args.out_dir / f"{label}.png")
        labels.append(label)
        arr = np.array(img)
        fill = (arr[..., 3] > 8).mean() if chroma else (arr[..., :3].max(axis=-1) > args.threshold).mean()
        if fill < 0.001:
            empty.append(label)
        print(f"  {label}.png  内容占比 {fill:5.2%}  锚点 ({c[0]:3d},{c[1]:3d})")

    # 条图压在固定底色上：直接存 RGBA 的话看图器会用自己的底色填透明区，
    # QC 时看到的就不是特效本来的样子。黑底 additive 压黑，抠图压草地色（它就落在草地上）
    strip = np.concatenate(
        [np.array(Image.open(args.out_dir / f"{l}.png").convert("RGBA")) for l in labels], axis=1
    ).astype(float)
    sa = strip[..., 3:4] / 255.0
    base = np.array(GRASS_RGB, dtype=float) if chroma else np.zeros(3)
    Image.fromarray((base * (1 - sa) + strip[..., :3] * sa).astype(np.uint8), "RGB").save(
        args.out_dir / f"{args.label}-strip.png"
    )

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
                "align": args.align,
                "key": args.key,
                "alpha_gamma": 0 if chroma else args.alpha_gamma,
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
    align_note = {"center": "固定格心", "core": "逐帧白核", "centroid": "逐帧质心"}[args.align]
    print(f"共用裁剪边长 side={side}，{align_note}对齐（原始 cell {cw}x{ch}）-> {args.out_dir}")
    if empty:
        print(f"⚠ 全黑帧: {empty}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
