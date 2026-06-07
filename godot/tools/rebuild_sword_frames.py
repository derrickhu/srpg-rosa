#!/usr/bin/env python3
"""根据 art/units/sword/ 下的帧图目录，重新生成 sword_frames.tres。"""
from __future__ import annotations

import glob
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SWORD_DIR = os.path.join(ROOT, "art", "units", "sword")
OUT_PATH = os.path.join(SWORD_DIR, "sword_frames.tres")
UID = "uid://brmgxxrqd5r5g"

ANIM_SPECS = [
    ("idle", "walk_up", "up", True, 5.0, ["up_00.png"]),
    ("default", "walk_down", "down", True, 5.0, ["down_00.png"]),
    ("walk_up", "walk_up", "up", True, 10.0, None),
    ("walk_down", "walk_down", "down", True, 10.0, None),
    ("walk_right", "walk_right", "right", True, 10.0, None),
    ("walk_left", "walk_left", "left", True, 10.0, None),
    ("attack_up", "attack_up", "atk", False, 12.0, None),
    ("attack_down", "attack_down", "atk", False, 12.0, None),
    ("attack_left", "attack_left", "atk", False, 12.0, None),
    ("attack_right", "attack_right", "atk", False, 12.0, None),
]


def collect_frames(folder: str, prefix: str, only: list[str] | None = None) -> list[str]:
    if only:
        names = only
    else:
        names = [os.path.basename(p) for p in sorted(glob.glob(os.path.join(SWORD_DIR, folder, f"{prefix}_*.png")))]
    return [f"res://art/units/sword/{folder}/{name}" for name in names]


def main() -> None:
    resolved: list[tuple[str, bool, float, list[str]]] = []
    for name, folder, prefix, loop, speed, only in ANIM_SPECS:
        paths = collect_frames(folder, prefix, only)
        if not paths:
            raise SystemExit(f"no frames for animation: {name}")
        resolved.append((name, loop, speed, paths))

    textures: list[str] = []
    tex_to_id: dict[str, int] = {}
    for _, _, _, paths in resolved:
        for path in paths:
            if path not in tex_to_id:
                tex_to_id[path] = len(textures) + 1
                textures.append(path)

    lines = [f'[gd_resource type="SpriteFrames" format=3 uid="{UID}"]', ""]
    for i, path in enumerate(textures, 1):
        lines.append(f'[ext_resource type="Texture2D" path="{path}" id="{i}"]')
    lines.append("")
    lines.append("[resource]")
    lines.append("animations = [")

    lines.append("{")
    lines.append('"frames": [],')
    lines.append('"loop": true,')
    lines.append('"name": &"default",')
    lines.append('"speed": 5.0')
    lines.append("}, ")

    for idx, (name, loop, speed, paths) in enumerate(resolved):
        lines.append("{")
        lines.append('"frames": [')
        for j, path in enumerate(paths):
            comma = "," if j < len(paths) - 1 else ""
            lines.append(f'{{"duration": 1.0, "texture": ExtResource("{tex_to_id[path]}")}}{comma}')
        lines.append("],")
        lines.append(f'"loop": {"true" if loop else "false"},')
        lines.append(f'"name": &"{name}",')
        lines.append(f'"speed": {speed}')
        trailing = "," if idx < len(resolved) - 1 else ""
        lines.append(f"}}{trailing}")

    lines.append("]")

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"wrote {OUT_PATH}")
    for name, loop, speed, paths in resolved:
        print(f"  {name}: {len(paths)} frames, loop={loop}, speed={speed}")


if __name__ == "__main__":
    main()
