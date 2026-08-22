#!/usr/bin/env python3
"""把弹体/光路按运行时的真实缩放画到草地上，旁边摆一个真实角色做参照。

存在的理由：`cells` 这个数字骗过人。它量的是格子，而玩家判断「这东西多大」用的
参照物是**站在格子里的人**（身高只有 0.92 格），所以 2.1 格的箭在配方里看着挺合理，
出屏是角色身高的 2.3 倍。这个脚本把两者摆在一起，让尺寸问题在改代码之前就看得见。

用法：
    python3 scripts/vfx-scale-preview.py --out /tmp/scale.png
"""

from __future__ import annotations

import argparse
import json
import pathlib

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
# 战场草地色，取自 BattlePlaybackView 的底色
GRASS = (202, 225, 54)
# computeBoardLayout 把格子夹在 28-56，满屏走的是上限
CELL = 56
# AnimatedUnit.UNIT_HEIGHT_CELLS
UNIT_HEIGHT_CELLS = 0.92
# vfxBlend.ts
BODY_ALPHA = 0.9
CORE_GAIN = 0.5


def load_unit(set_id: str, anim: str = "idle") -> Image.Image:
    """按运行时口径把角色贴图缩到 0.92 格高。"""
    m = json.loads((ROOT / "src/data/anim" / f"{set_id}.json").read_text())
    sheet = Image.open(ROOT / m["image"]).convert("RGBA")
    name = m["animations"][anim]["frames"][0]
    fr = m["frames"][name]
    f = fr["frame"]
    sub = sheet.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
    # AnimatedUnit: fit = cell * heightCells / metrics.subjectHeight
    fit = CELL * UNIT_HEIGHT_CELLS / m["metrics"]["subjectHeight"]
    return sub.resize((max(1, round(sub.width * fit)), max(1, round(sub.height * fit))), Image.LANCZOS)


def blend_two_pass(bg: np.ndarray, fx: Image.Image, x: int, y: int) -> None:
    """就地做两段式混合：普通混合的形体层 + additive 的核心层（见 vfxBlend.ts）。"""
    a = np.array(fx).astype(float)
    h, w = a.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(bg.shape[1], x + w), min(bg.shape[0], y + h)
    if x1 <= x0 or y1 <= y0:
        return
    src = a[y0 - y : y1 - y, x0 - x : x1 - x]
    dst = bg[y0:y1, x0:x1]
    al = src[..., 3:4] / 255.0
    rgb = src[..., :3]
    out = dst * (1 - al * BODY_ALPHA) + rgb * (al * BODY_ALPHA)
    bg[y0:y1, x0:x1] = np.clip(out + rgb * al * CORE_GAIN, 0, 255)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=pathlib.Path, required=True)
    args = ap.parse_args()

    rows = [
        ("普攻 木箭 0.62 格", "images/fx/proj_arrow_wood.png", 0.62),
        ("穿透 重箭 1.15 格", "images/fx/proj_arrow_heavy.png", 1.15),
        ("速射 轻箭 0.50 格", "images/fx/proj_arrow_snap.png", 0.50),
        ("（改前）重箭 2.10 格", "images/fx/proj_arrow_heavy.png", 2.10),
        ("（改前）木箭 1.05 格", "images/fx/proj_arrow_wood.png", 1.05),
    ]
    unit = load_unit("bow")
    row_h = CELL * 2
    W = CELL * 9
    H = row_h * len(rows)
    bg = np.zeros((H, W, 3), dtype=float)
    bg[:, :] = GRASS

    for i, (_, path, cells) in enumerate(rows):
        cy = i * row_h + row_h // 2
        # 参照角色：脚线对齐格心下方 0.2 格，跟运行时一致
        bg_img = None
        ux = CELL
        uy = cy - unit.height // 2
        u = np.array(unit).astype(float)
        ua = u[..., 3:4] / 255.0
        sl = bg[uy : uy + unit.height, ux : ux + unit.width]
        bg[uy : uy + unit.height, ux : ux + unit.width] = sl * (1 - ua) + u[..., :3] * ua
        del bg_img

        sprite = Image.open(ROOT / path).convert("RGBA")
        size = max(CELL * cells, CELL * 0.5)
        scale = size / sprite.width
        arrow = sprite.resize(
            (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))),
            Image.LANCZOS,
        )
        blend_two_pass(bg, arrow, CELL * 3, cy - arrow.height // 2)

    Image.fromarray(bg.astype(np.uint8)).save(args.out)
    for label, _, cells in rows:
        print(f"  {label:22s} 出屏 {CELL*cells:5.1f}px = 角色身高的 {cells/UNIT_HEIGHT_CELLS:.2f} 倍")
    print(f"-> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
