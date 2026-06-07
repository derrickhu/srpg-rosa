#!/usr/bin/env bash
# 为微信小游戏生成精简中文字体（自动扫描 godot/ 内 .gd / .tscn 文案）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/godot/art/fonts/SourceHanSansSC-Bold.otf"
OUT="$ROOT/godot/art/fonts/SourceHanSansSC-Bold-subset.otf"
CHARS_FILE="$(mktemp)"
trap 'rm -f "$CHARS_FILE"' EXIT

if [[ ! -f "$SRC" ]]; then
  echo "缺少字体: $SRC"
  exit 1
fi

PYFT="$(command -v pyftsubset || true)"
if [[ -z "$PYFT" ]]; then
  echo "需要 pyftsubset (pip install fonttools)"
  exit 1
fi

python3 "$ROOT/scripts/collect-game-font-chars.py" "$ROOT" >"$CHARS_FILE"

CHAR_COUNT="$(wc -m <"$CHARS_FILE" | tr -d ' ')"
echo "从工程收集到 ${CHAR_COUNT} 个字符"

"$PYFT" "$SRC" \
  --output-file="$OUT" \
  --text-file="$CHARS_FILE" \
  --layout-features='*' \
  --glyph-names \
  --symbol-cmap \
  --legacy-cmap

python3 - <<PY
import json
import re
from pathlib import Path

chars = Path("$CHARS_FILE").read_text(encoding="utf-8")
import_path = Path("$ROOT/godot/art/fonts/SourceHanSansSC-Bold-subset.otf.import")
content = import_path.read_text(encoding="utf-8")
escaped = json.dumps(chars, ensure_ascii=False)[1:-1]
replacement = (
    "preload={\\n"
    f'"chars": "{escaped}",\\n'
    '"glyphs": [],\\n'
    '"icons": [],\\n'
    '"common": false,\\n'
    '"latin": false,\\n'
    '"latin_accents": false,\\n'
    '"cyrillic": false,\\n'
    '"greek": false,\\n'
    '"cjk": false,\\n'
    '"kana": false,\\n'
    '"hangul": false\\n'
    "}\\n"
)
content, count = re.subn(
    r"preload=\[[^\]]*\]|preload=\{[^}]*\}",
    replacement.rstrip("\\n"),
    content,
    count=1,
    flags=re.DOTALL,
)
if count != 1:
    raise SystemExit("无法更新 subset 字体 preload 配置")
content = content.replace("allow_system_fallback=true", "allow_system_fallback=false")
content = content.replace("disable_embedded_bitmaps=true", "disable_embedded_bitmaps=false")
content = content.replace("compress=true", "compress=false")
import_path.write_text(content, encoding="utf-8")
print("已写入字体 preload（WASM: 嵌入字形、不压缩）")
PY

GODOT_BIN="${GODOT_BIN:-$ROOT/tools/godot/Godot.app/Contents/MacOS/Godot}"
if [[ -x "$GODOT_BIN" ]]; then
  "$GODOT_BIN" --path "$ROOT/godot" --headless --import 2>/dev/null | tail -3 || true
fi

python3 - <<PY
import re
from pathlib import Path

root = Path("$ROOT")
import_path = root / "godot/art/fonts/SourceHanSansSC-Bold-subset.otf.import"
match = re.search(r'uid="(uid://[^"]+)"', import_path.read_text(encoding="utf-8"))
if not match:
    raise SystemExit("无法读取子集字体 uid")
uid = match.group(1)
font_path = "res://art/fonts/SourceHanSansSC-Bold-subset.otf"
pattern = re.compile(
    rf'(\[ext_resource type="FontFile" )uid="uid://[^"]+"( path="{re.escape(font_path)}")'
)
for rel in ("godot/art/ui/game_theme.tres",):
    path = root / rel
    text = path.read_text(encoding="utf-8")
    updated = pattern.sub(rf'\1uid="{uid}"\2', text)
    if updated != text:
        path.write_text(updated, encoding="utf-8")
        print(f"已同步字体 uid -> {rel}")
PY

ls -lh "$OUT"
