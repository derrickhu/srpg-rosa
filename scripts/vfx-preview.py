#!/usr/bin/env python3
"""把特效帧按 Pixi 的混合数学离线叠到真实战场底图上，用来**看**而不是猜。

为什么需要它：additive 效果的问题在代码里看不出来。`VFX_ADD_GAIN = 0.82` 是个合理的数字，
帧图单看也漂亮，但战场草地是 RGB(202,225,54)——绿通道已经 225/255。ADD 叠上去只能往
255 推，于是所有中间调和暗部（也就是形状和质感的全部信息）在屏幕上一起消失，
剩下一团亮斑。这个脚本把那一步算出来并画成图，顺便报告过曝像素占比。

用法：
    python3 scripts/vfx-preview.py flame_ring --frame 2
    python3 scripts/vfx-preview.py ember_burst --frame 2 --out /tmp/x.png
"""

from __future__ import annotations

import argparse
import json
import pathlib

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
# 战场草地实测色，见 images/bg/battle_bg.png 中心区
GRASS = (202, 225, 54)


def load_frame(set_id: str, frame_idx: int) -> np.ndarray:
    """从图集里取第 N 帧的 RGB（帧内是黑底不透明图，alpha 只标 trim 区）。"""
    manifest = json.loads((ROOT / "src/data/anim" / f"{set_id}.json").read_text())
    sheet = Image.open(ROOT / manifest["image"]).convert("RGBA")
    frames = manifest["animations"][set_id]["frames"]
    name = frames[min(frame_idx, len(frames) - 1)]
    f = manifest["frames"][name]["frame"]
    crop = sheet.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
    return np.array(crop).astype(float)


def blend_add(bg: np.ndarray, fx: np.ndarray, gain: float) -> np.ndarray:
    """Pixi BLEND_MODES.ADD + sprite.alpha=gain。alpha=0 的 trim 区不参与。"""
    a = (fx[..., 3:4] / 255.0) * gain
    return np.clip(bg + fx[..., :3] * a, 0, 255)


def blend_runtime(bg: np.ndarray, fx: np.ndarray, body: float, core: float) -> np.ndarray:
    """复现现在**运行时真正走的**那条路径，见 `src/view/vfxBlend.ts`。

    形体层：普通混合，alpha 直接取图集里烘好的那一通道（不是这里再算一遍），
    所以这个函数验的是「重烘 + 两段式」整条链的端到端结果，而不是一个理想模型。
    核心层：同一张贴图叠 additive，Pixi 上传纹理会预乘，贡献是 rgb*a*core。
    """
    a = fx[..., 3:4] / 255.0
    out = bg * (1 - a * body) + fx[..., :3] * (a * body)
    out = out + fx[..., :3] * a * core
    return np.clip(out, 0, 255)


def blend_screen(bg: np.ndarray, fx: np.ndarray, gain: float) -> np.ndarray:
    a = (fx[..., 3:4] / 255.0) * gain
    src = fx[..., :3] * a
    return 255 - (255 - bg) * (255 - src) / 255.0


def bake_alpha(fx: np.ndarray, gamma: float) -> np.ndarray:
    """按亮度烘出 alpha 通道，供普通混合那一层做遮挡用。

    帧图现在是「黑底 + alpha 全 255」，只能靠 ADD 让黑消失。想让暗部真的**挡住**草地
    （有遮挡才有体积），就必须把亮度搬进 alpha。gamma > 1 会压低暗部的覆盖度：
    近黑的像素贴上去只会在草地上糊一圈脏边，不是想要的接触阴影。
    """
    lum = fx[..., :3].max(axis=-1, keepdims=True) / 255.0
    trim = fx[..., 3:4] / 255.0
    return np.power(np.clip(lum, 0, 1), gamma) * trim


def blend_body_plus_core(
    bg: np.ndarray,
    fx: np.ndarray,
    body_alpha: float = 1.0,
    core_gain: float = 0.55,
    knee: float = 0.62,
    gamma: float = 1.5,
) -> np.ndarray:
    """两段式：形体走**普通混合**（alpha=亮度^gamma），只有高光再叠一层 additive。

    这是「很亮但没实感」的正解。纯 ADD 下画面里的深色硬外沿贴的是 0，等于不存在，
    所以每个特效都退化成它最亮的那部分——而形状和质感的信息全在中间调和暗部。
    分两段之后：普通混合那一层把外沿和纹理**压**到草地上（会变暗，因此有体积），
    additive 只负责白热核心那一点点，亮得起来但不会糊成一片。
    """
    a = bake_alpha(fx, gamma) * body_alpha
    out = bg * (1 - a) + fx[..., :3] * a
    lum = fx[..., :3].max(axis=-1, keepdims=True) / 255.0
    core = np.clip((lum - knee) / max(1 - knee, 1e-3), 0, 1) * (fx[..., 3:4] / 255.0)
    out = out + fx[..., :3] * core * core_gain
    return np.clip(out, 0, 255)


def clip_ratio(img: np.ndarray) -> float:
    return float((img >= 254.5).all(axis=-1).mean())


def wash_ratio(img: np.ndarray) -> float:
    """接近白（三通道都很高）的像素——这就是玩家说的「洗成一团白光」。"""
    return float((img.min(axis=-1) >= 225).mean())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("set_ids", nargs="+")
    ap.add_argument("--frame", type=int, default=1, help="取第几帧（0 基）")
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path("/tmp/vfx-preview.png"))
    ap.add_argument("--body", type=float, default=0.9, help="对齐 VFX_BODY_ALPHA")
    ap.add_argument("--core", type=float, default=0.5, help="对齐 VFX_CORE_GAIN")
    args = ap.parse_args()

    rows = []
    for set_id in args.set_ids:
        fx = load_frame(set_id, args.frame)
        h, w = fx.shape[0], fx.shape[1]
        bg = np.zeros((h, w, 3), dtype=float)
        bg[..., 0], bg[..., 1], bg[..., 2] = GRASS
        # 旧口径：alpha 当年全是 255，所以要把烘好的 alpha 摁回不透明才能还原当时的样子
        old = fx.copy()
        old[..., 3] = np.where(fx[..., 3] > 0, 255, 0)
        cur = blend_add(bg, old, 0.82)
        new = blend_runtime(bg, fx, args.body, args.core)
        rows.append((set_id, cur, new))
        print(
            f"  {set_id:14s} 现状 过曝{clip_ratio(cur):6.2%} 近白{wash_ratio(cur):6.2%}"
            f"  |  新 过曝{clip_ratio(new):6.2%} 近白{wash_ratio(new):6.2%}"
        )

    pad = 6
    cw = max(r[1].shape[1] for r in rows)
    chh = max(r[1].shape[0] for r in rows)
    out = Image.new(
        "RGB", (cw * 2 + pad, chh * len(rows) + pad * (len(rows) - 1)), (20, 20, 20)
    )
    for r, (_sid, cur, new) in enumerate(rows):
        y = r * (chh + pad)
        for c, img in enumerate((cur, new)):
            out.paste(Image.fromarray(img.astype(np.uint8), "RGB"), (c * (cw + pad), y))
    out.save(args.out)
    print(f"列序：旧口径 纯ADD 0.82 / 现口径 形体{args.body}+核心{args.core}")
    print(f"-> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
