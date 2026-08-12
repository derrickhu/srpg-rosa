#!/usr/bin/env python3
"""从 src/ 扫描文案 → 子集化展示字体（得意黑）→ fonts/SmileySans-subset.ttf

正文用系统字，不打思源。源文件：tools/font-src/SmileySans-Oblique.ttf（gitignore）。
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "src"
OUT_DIR = ROOT / "fonts"
FONT_SRC = ROOT / "tools" / "font-src"
SRC_TTF = FONT_SRC / "SmileySans-Oblique.ttf"
OUT_TTF = OUT_DIR / "SmileySans-subset.ttf"

ESSENTIAL = (
    " "
    "·：，。、！？；：（）【】/%+-×=~<>"
    "0123456789"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
)

STR_RE = re.compile(
    r'"(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'|`(?:[^`\\]|\\.)*`'
)
COMMENT_RE = re.compile(r"//.*?$|/\*.*?\*/", re.MULTILINE | re.DOTALL)


def is_game_char(ch: str) -> bool:
    if ch in ("\n", "\t", "\r"):
        return False
    if ch == " ":
        return True
    code = ord(ch)
    if code < 128:
        return ch in ESSENTIAL
    if 0x4E00 <= code <= 0x9FFF:
        return True
    if 0x3000 <= code <= 0x303F:
        return True
    if 0xFF00 <= code <= 0xFFEF:
        return True
    return ch in "·、【】。！？（）：；×"


def unescape(literal: str) -> str:
    body = literal[1:-1]
    return (
        body.replace("\\\\", "\x00")
        .replace("\\n", "\n")
        .replace("\\t", "\t")
        .replace('\\"', '"')
        .replace("\\'", "'")
        .replace("\\`", "`")
        .replace("\x00", "\\")
    )


def collect_chars() -> str:
    chars: set[str] = set(ESSENTIAL)
    for path in sorted(SRC_DIR.rglob("*.ts")):
        text = COMMENT_RE.sub("", path.read_text(encoding="utf-8"))
        for m in STR_RE.finditer(text):
            for ch in unescape(m.group(0)):
                if is_game_char(ch):
                    chars.add(ch)
    return "".join(sorted(chars))


def run_subset(src: Path, out: Path, chars_file: Path) -> None:
    pyft = shutil.which("pyftsubset")
    if not pyft:
        raise SystemExit("需要 pyftsubset：pip install fonttools")
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.check_call(
        [
            pyft,
            str(src),
            f"--output-file={out}",
            f"--text-file={chars_file}",
            "--layout-features=*",
            "--glyph-names",
            "--symbol-cmap",
            "--legacy-cmap",
            "--notdef-outline",
            "--recommended-glyphs",
            "--name-IDs=*",
            "--name-legacy",
            "--name-languages=*",
        ]
    )


def main() -> int:
    if not SRC_TTF.is_file():
        raise SystemExit(
            f"缺少展示字体源 {SRC_TTF}\n"
            "请从 https://github.com/atelier-anchor/smiley-sans/releases 下载\n"
            "SmileySans-Oblique.ttf 放到 tools/font-src/"
        )

    chars = collect_chars()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    chars_file = OUT_DIR / ".charset.txt"
    chars_file.write_text(chars, encoding="utf-8")
    print(f"收集到 {len(chars)} 个字符 → {chars_file.relative_to(ROOT)}")

    # 得意黑 release 已是 TrueType，无需 CFF 转换
    print(f"子集化展示字体: {SRC_TTF.name} → {OUT_TTF.relative_to(ROOT)}")
    run_subset(SRC_TTF, OUT_TTF, chars_file)
    print(f"  {OUT_TTF.name}: {OUT_TTF.stat().st_size / 1024:.1f} KB")

    # 清掉旧的思源产物
    for stale in OUT_DIR.glob("SourceHanSansSC-*"):
        stale.unlink()
        print(f"已删除旧字体 {stale.name}")

    ofl = OUT_DIR / "OFL.txt"
    if not ofl.is_file() or "Smiley" not in ofl.read_text(encoding="utf-8", errors="ignore"):
        # 保留已下载的 LICENSE；否则写简短指向
        if not ofl.is_file():
            ofl.write_text(
                "Smiley Sans (得意黑) — SIL Open Font License 1.1\n"
                "https://github.com/atelier-anchor/smiley-sans\n",
                encoding="utf-8",
            )
    print("完成。展示字体在 fonts/SmileySans-subset.ttf；正文请用系统字。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
