#!/usr/bin/env python3
"""按各产物目录记下的 pipeline-meta.json 重跑 vfx-sheet.py，整批换一次烘制参数。

存在的理由：`vfx-sheet.py` 的产物目录里都留了 `raw-sheet.png` 和当次的参数，
所以任何一次口径调整（比如把亮度烘进 alpha）都能对全部特效集**原样复现**一遍，
不用回去翻当初每一招是用什么命令切的。没有这一步的话，改混合口径就等于
「新特效用新口径、老特效停在老口径」，同一场战斗里两种质感混着出现。

用法：
    python3 scripts/vfx-rebake.py                # 全部
    python3 scripts/vfx-rebake.py flame_ring     # 指定几个
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
RUNS = ROOT / "art/vfx-runs"
ALPHA_GAMMA = 2.0


def bake_dir_in_place(d: pathlib.Path, labels: list[str]) -> int:
    """给 `vfx_frames` 模式的产物就地烘 alpha。

    这批（火球、圣击、穿透尾迹、剑士挥砍）是更早的 `process_vfx_frames.py` 出的，
    只留了逐帧 PNG 没留原始网格图，所以走不了 vfx-sheet 那条重切的路。
    但烘 alpha 只读 RGB、只写 alpha，RGB 全程不动，所以就地做是安全且幂等的
    ——重复跑一次得到的还是同一个结果。

    不能把它们漏掉：同一场战斗里，法师普攻用旧口径（纯 additive 洗成白光）、
    技能用新口径（有体积），两种质感对着出现比统一地糙更糟。
    """
    n = 0
    for label in labels:
        p = d / f"{label}.png"
        if not p.exists():
            continue
        a = np.array(Image.open(p).convert("RGBA"))
        lum = a[..., :3].max(axis=-1).astype(float) / 255.0
        a[..., 3] = np.clip(np.power(lum, ALPHA_GAMMA) * 255.0 + 0.5, 0, 255).astype(np.uint8)
        Image.fromarray(a, "RGBA").save(p)
        n += 1
    return n


def main() -> int:
    only = set(sys.argv[1:])
    ids = sorted(p.name for p in RUNS.iterdir() if p.is_dir())
    if only:
        ids = [i for i in ids if i in only]
        missing = only - set(ids)
        if missing:
            print(f"找不到产物目录: {sorted(missing)}")
            return 1

    failed: list[str] = []
    for set_id in ids:
        d = RUNS / set_id
        meta_path = d / "pipeline-meta.json"
        raw = d / "raw-sheet.png"
        if not meta_path.exists():
            print(f"  跳过 {set_id}（缺 pipeline-meta.json）")
            continue
        if not raw.exists() and json.loads(meta_path.read_text()).get("mode") != "vfx_frames":
            print(f"  跳过 {set_id}（缺 raw-sheet.png）")
            continue
        meta = json.loads(meta_path.read_text())
        if meta.get("mode") == "vfx_frames":
            n = bake_dir_in_place(d, meta["frame_labels"])
            print(f"✓ {set_id:20s} 就地烘 alpha，{n} 帧（vfx_frames，无原始网格图）")
            continue
        if meta.get("mode") != "vfx_sheet":
            print(f"  跳过 {set_id}（未知 mode={meta.get('mode')}）")
            continue
        cmd = [
            sys.executable,
            str(ROOT / "scripts/vfx-sheet.py"),
            str(raw),
            "--out-dir", str(d),
            "--rows", str(meta["rows"]),
            "--cols", str(meta["cols"]),
            "--label", set_id,
            "--count", str(len(meta["frame_labels"])),
            "--size", str(meta["cell_size"]),
            "--threshold", str(meta["threshold"]),
            "--align", meta.get("align", "centroid"),
        ]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            failed.append(set_id)
            print(f"✗ {set_id}\n{r.stdout}{r.stderr}")
        else:
            tail = [l for l in r.stdout.strip().splitlines() if l.startswith("共用")]
            print(f"✓ {set_id:20s} {tail[0] if tail else ''}")

    print(f"\n共 {len(ids)} 个集合，失败 {len(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
