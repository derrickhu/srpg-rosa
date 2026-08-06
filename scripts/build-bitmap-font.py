#!/usr/bin/env python3
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
FONT_CANDIDATES = [
    ROOT / "godot/art/fonts/SourceHanSansSC-Medium.otf",
    ROOT / "godot/art/fonts/SourceHanSansSC-Regular.otf",
    ROOT / "godot/art/fonts/SourceHanSansSC-Bold.otf",
]
ATLAS_PATH = ROOT / "godot/art/ui/bitmap_font.png"
DATA_PATH = ROOT / "godot/scripts/ui/BitmapFontData.gd"

FONT_SIZE = 64
CELL = 80
PADDING = 8


def gd_string(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def collect_chars() -> str:
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts/collect-game-font-chars.py"), str(ROOT)],
        check=True,
        capture_output=True,
        text=True,
    )
    chars = set(result.stdout)
    chars.update("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz -/:.%")
    chars.discard("\n")
    chars.discard("\t")
    return "".join(sorted(chars))


def main() -> None:
    font_path = next((path for path in FONT_CANDIDATES if path.exists()), None)
    if font_path is None:
        raise SystemExit("缺少位图字库源字体：godot/art/fonts/SourceHanSansSC-*.otf")

    chars = collect_chars()
    font = ImageFont.truetype(str(font_path), FONT_SIZE)

    columns = 16
    rows = math.ceil(len(chars) / columns)
    atlas = Image.new("RGBA", (columns * CELL, rows * CELL), (0, 0, 0, 0))
    draw = ImageDraw.Draw(atlas)
    glyphs = {}

    for index, ch in enumerate(chars):
        col = index % columns
        row = index // columns
        x = col * CELL
        y = row * CELL
        bbox = draw.textbbox((0, 0), ch, font=font)
        width = max(1, bbox[2] - bbox[0])
        height = max(1, bbox[3] - bbox[1])
        draw_x = x + (CELL - width) / 2 - bbox[0]
        draw_y = y + (CELL - height) / 2 - bbox[1]
        draw.text((draw_x, draw_y), ch, font=font, fill=(255, 255, 255, 255))
        advance = max(width + PADDING, FONT_SIZE * 0.5)
        glyphs[ch] = (x, y, CELL, CELL, advance)

    ATLAS_PATH.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(ATLAS_PATH)

    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "class_name BitmapFontData",
        "extends RefCounted",
        "",
        'const ATLAS_PATH := "res://art/ui/bitmap_font.png"',
        f"const BASE_SIZE := {FONT_SIZE}.0",
        "const GLYPHS := {",
    ]
    for ch, (x, y, w, h, advance) in glyphs.items():
        lines.append(
            f"\t{gd_string(ch)}: [Rect2({x}, {y}, {w}, {h}), {advance:.2f}],"
        )
    lines.extend(["}", ""])
    DATA_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"位图字库: {ATLAS_PATH.relative_to(ROOT)} ({len(chars)} chars)")


if __name__ == "__main__":
    main()
