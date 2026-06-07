#!/usr/bin/env python3
"""薄封装：调用 game-vfx-pipeline skill 的压黑脚本。"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path

SKILL_SCRIPT = Path.home() / ".cursor/skills/game-vfx-pipeline/scripts/process_vfx_frames.py"

if __name__ == "__main__":
    if not SKILL_SCRIPT.is_file():
        raise SystemExit(f"missing skill script: {SKILL_SCRIPT}")
    sys.argv[0] = str(SKILL_SCRIPT)
    runpy.run_path(str(SKILL_SCRIPT), run_name="__main__")
