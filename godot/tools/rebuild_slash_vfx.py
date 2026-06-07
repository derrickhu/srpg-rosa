#!/usr/bin/env python3
"""从 game_assets 成品帧重建 slash_frames.tres 并同步到 Godot。"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
SKILL = Path.home() / ".cursor/skills/game-vfx-pipeline/scripts"
ASSETS = WORKSPACE.parent / "game_assets/srpg-rosa/assets/vfx/slash_hit"
FINAL = ASSETS / "final"
FRAMES_DST = ROOT / "art/vfx/slash/frames"
TRES_OUT = ROOT / "art/vfx/slash/slash_frames.tres"


def run(cmd: list[str]) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, check=True)


def main() -> None:
    if not FINAL.is_dir():
        raise SystemExit(f"missing final frames: {FINAL}")

    run(
        [
            sys.executable,
            str(SKILL / "sync_vfx_to_godot.py"),
            "--src",
            str(FINAL),
            "--dst",
            str(FRAMES_DST),
            "--glob",
            "slash_*.png",
        ]
    )
    run(
        [
            sys.executable,
            str(SKILL / "rebuild_sprite_frames_tres.py"),
            "--frames-dir",
            str(FINAL),
            "--glob",
            "slash_*.png",
            "--animation",
            "slash",
            "--speed",
            "16.0",
            "--res-prefix",
            "res://art/vfx/slash/frames",
            "--output",
            str(TRES_OUT),
            "--uid",
            "uid://cslashvfx001",
        ]
    )
    print(f"done: {TRES_OUT}")


if __name__ == "__main__":
    main()
