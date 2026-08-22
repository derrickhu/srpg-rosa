#!/usr/bin/env python3
"""把 12 招副本临时技能的招牌零件按运行时混合数学叠到战场草地上，拼成一张检视图。

为什么需要这个：单看帧图（黑底或洋红底）完全看不出上屏效果。战场草地是
RGB(202,225,54)——很亮、绿通道已经 225/255，一张亮绿的特效帧单看很漂亮，
叠上去形状会整片消失。这一族技能第一版就是这么翻车的，五招在草地上近似隐形。

用法：python3 scripts/temp-skill-review.py [-o 输出路径]
"""
from __future__ import annotations

import argparse
import json
import pathlib

import numpy as np
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
GRASS = (202, 225, 54)
# 与 src/view/vfxBlend.ts 保持一致
BODY_ALPHA = 0.9
CORE_GAIN = 0.5
TILE = 220
PEAK_FRAME = 4  # 起峰帧，1-based

# (标签, 类型, 素材 id, 是否 additive)。set 的混合方式从图集清单里读，
# prop 必须显式给——`prop_horn` 是黑底发光图（配方里写了 `blend: 'add'`），
# 其余三件是绿幕抠出来的实体，走普通混合。假设「道具都是实体」会把号角渲成黑方块。
ENTRIES = [
    ("野草缠足 / 缠住腿", "set", "temp_gl_snare", None),
    ("草药敷治 / 药罐", "prop", "prop_salve", False),
    ("蜂群 / 弹道扰动", "set", "swarm_bees", None),
    ("蜂群 / 命中炸开", "set", "temp_gl_swarm", None),
    ("冲锋号角 / 号", "prop", "prop_horn", True),
    ("松脂火把 / 四簇火", "set", "temp_fo_torch", None),
    ("荆棘绞缠 / 向内收", "set", "temp_fo_thorn", None),
    ("树皮庇护 / 甲", "set", "temp_fo_bark", None),
    ("守林人之姿 / 根+冠", "set", "temp_fo_warden", None),
    ("撞城槌 / 槌", "prop", "prop_ram", False),
    ("撞城槌 / 钝击", "set", "temp_ft_ram", None),
    ("压制号令 / 下压", "set", "temp_ft_suppress", None),
    ("攻城战旗 / 旗", "prop", "prop_banner", False),
    ("飞爪钩索 / 铁爪", "set", "temp_ft_grapple", None),
]


def blend_on_grass(rgba: np.ndarray, additive: bool, two_pass: bool = True) -> np.ndarray:
    """按运行时的混合数学把一帧叠到纯草地色上。

    运行时有三条不同的路，公式不能混用：

    - 图集 + additive：`playFxAnimation` 走**两段式**（形体普混 + 核心 additive）。
    - 道具 + additive：`playPropBurst` 是**纯 additive 单层**。号角就在这条路上——
      它的 PNG 是 alpha 全 255 的黑底发光图，纯 additive 下黑会消失，
      但要是误当成两段式，形体层会把整张黑底铺上去，预览里就是一个黑方块。
    - 普通混合：按 alpha 直接叠。
    """
    a = rgba[..., 3:4] / 255.0
    src = rgba[..., :3].astype(float)
    bg = np.array(GRASS, dtype=float)
    if additive and two_pass:
        out = bg * (1 - a * BODY_ALPHA) + src * a * BODY_ALPHA + src * a * CORE_GAIN
    elif additive:
        out = bg + src * a
    else:
        out = bg * (1 - a) + src * a
    return np.clip(out, 0, 255).astype(np.uint8)


def load_set_frame(set_id: str) -> tuple[np.ndarray, bool]:
    manifest = json.loads((ROOT / "src/data/anim" / f"{set_id}.json").read_text())
    names = manifest["animations"][set_id]["frames"]
    name = names[min(PEAK_FRAME - 1, len(names) - 1)]
    box = manifest["frames"][name]["frame"]
    sheet = Image.open(ROOT / manifest["image"]).convert("RGBA")
    crop = sheet.crop((box["x"], box["y"], box["x"] + box["w"], box["y"] + box["h"]))
    return np.array(crop), manifest.get("blend") == "add"


def load_prop(prop_id: str, additive: bool) -> tuple[np.ndarray, bool]:
    return np.array(Image.open(ROOT / "images/fx" / f"{prop_id}.png").convert("RGBA")), additive


def weak_ratio(rgba: np.ndarray, additive: bool, two_pass: bool) -> float:
    """自身像素中与草地色差 <60 的比例——上屏「隐形」的那部分。"""
    a = rgba[..., 3] / 255.0
    mask = a > 0.08
    if not mask.any():
        return 0.0
    out = blend_on_grass(rgba, additive, two_pass).astype(float)
    diff = np.abs(out - np.array(GRASS, dtype=float)).sum(axis=2)
    return float((diff[mask] < 60).mean())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out", type=pathlib.Path, default=pathlib.Path("/tmp/temp-skill-review.png"))
    args = ap.parse_args()

    cols = 5
    rows = (len(ENTRIES) + cols - 1) // cols
    pad, label_h = 8, 20
    canvas = Image.new("RGB", (cols * (TILE + pad) + pad, rows * (TILE + pad + label_h) + pad), (30, 30, 34))
    draw = ImageDraw.Draw(canvas)

    for i, (label, kind, asset, prop_add) in enumerate(ENTRIES):
        rgba, additive = (
            load_set_frame(asset) if kind == "set" else load_prop(asset, bool(prop_add))
        )
        two_pass = kind == "set"
        ratio = weak_ratio(rgba, additive, two_pass)
        composited = Image.fromarray(blend_on_grass(rgba, additive, two_pass), "RGB")
        # 保留原比例塞进方格，空处填草地色，模拟真实底色
        tile = Image.new("RGB", (TILE, TILE), GRASS)
        scale = min(TILE / composited.width, TILE / composited.height)
        fit = composited.resize((max(1, int(composited.width * scale)), max(1, int(composited.height * scale))), Image.LANCZOS)
        tile.paste(fit, ((TILE - fit.width) // 2, (TILE - fit.height) // 2))

        cx = pad + (i % cols) * (TILE + pad)
        cy = pad + (i // cols) * (TILE + pad + label_h)
        canvas.paste(tile, (cx, cy))
        blend_tag = "add" if additive else "normal"
        draw.text((cx + 2, cy + TILE + 4), f"{label}  [{blend_tag} 隐形{ratio * 100:.0f}%]", fill=(230, 230, 235))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.out)
    print(f"wrote {args.out}  ({canvas.width}x{canvas.height})")


if __name__ == "__main__":
    main()
