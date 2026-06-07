#!/usr/bin/env python3
"""从 Godot 工程收集游戏文案用字，供微信字体子集与 preload 使用。"""
from __future__ import annotations

import re
import sys
from pathlib import Path

# 源码里常出现、但不一定落在引号字符串里的字符
ESSENTIAL_CHARS = (
    " "
    "·：，。、！？；：（）【】/%"
    "0123456789"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
)

GD_STRING_RE = re.compile(r'"(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'')
TSCN_TEXT_RE = re.compile(r'\btext\s*=\s*"(?:[^"\\]|\\.)*"')
GD_COMMENT_RE = re.compile(r"#.*")


def _unescape_gd_string(literal: str) -> str:
    body = literal[1:-1]
    return (
        body.replace("\\\\", "\x00")
        .replace("\\n", "\n")
        .replace("\\t", "\t")
        .replace('\\"', '"')
        .replace("\\'", "'")
        .replace("\x00", "\\")
    )


def _is_game_char(ch: str) -> bool:
    if ch in ("\n", "\t"):
        return False
    if ch == " ":
        return True
    code = ord(ch)
    if code < 128:
        return ch in ESSENTIAL_CHARS
    if 0x4E00 <= code <= 0x9FFF:
        return True
    if 0x3000 <= code <= 0x303F:
        return True
    if 0xFF00 <= code <= 0xFFEF:
        return True
    return ch in "·、【】。！？（）：；"


def _strings_from_gd(text: str) -> list[str]:
    without_comments = GD_COMMENT_RE.sub("", text)
    out: list[str] = []
    for match in GD_STRING_RE.finditer(without_comments):
        out.append(_unescape_gd_string(match.group(0)))
    return out


def _strings_from_tscn(text: str) -> list[str]:
    out: list[str] = []
    for match in TSCN_TEXT_RE.finditer(text):
        literal = match.group(0).split("=", 1)[1].strip()
        out.append(_unescape_gd_string(literal))
    return out


def collect_chars(godot_dir: Path) -> str:
    chars: set[str] = set(ESSENTIAL_CHARS)

    for pattern, parser in (("*.gd", _strings_from_gd), ("*.tscn", _strings_from_tscn)):
        for path in sorted(godot_dir.rglob(pattern)):
            if ".godot" in path.parts or path.name.endswith(".uid"):
                continue
            text = path.read_text(encoding="utf-8")
            for chunk in parser(text):
                chars.update(chunk)

    cleaned = {ch for ch in chars if _is_game_char(ch)}
    return "".join(sorted(cleaned))


def main() -> int:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
    godot_dir = root / "godot"
    if not godot_dir.is_dir():
        print(f"缺少目录: {godot_dir}", file=sys.stderr)
        return 1
    result = collect_chars(godot_dir)
    sys.stdout.write(result)
    print(f"\n# 共 {len(result)} 个字符", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
