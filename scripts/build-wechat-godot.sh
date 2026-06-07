#!/usr/bin/env bash
# Godot → 微信小游戏（wechat-godot/）
# 用法：./scripts/build-wechat-godot.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GODOT_DIR="$ROOT/godot"
OUT_DIR="$ROOT/wechat-godot"
GODOT_BIN="${GODOT_BIN:-$ROOT/tools/godot/Godot.app/Contents/MacOS/Godot}"
TEMPLATE_TPZ="${TEMPLATE_TPZ:-/tmp/minigame4.6.2.tpz}"
TEMPLATE_URL="${TEMPLATE_URL:-https://github.com/godothub/godot-minigame/releases/download/4.6.2/minigame4.6.2.tpz}"

if [[ ! -x "$GODOT_BIN" ]]; then
  echo "缺少 Godot：$GODOT_BIN"
  echo "请解压 Godot 4.6.x 到 tools/godot/，或设置 GODOT_BIN"
  exit 1
fi

echo "==> 准备微信小游戏壳（模板 4.6.2）"
if [[ ! -f "$TEMPLATE_TPZ" ]]; then
  echo "下载模板: $TEMPLATE_URL"
  curl -sL -o "$TEMPLATE_TPZ" "$TEMPLATE_URL"
fi
mkdir -p "$OUT_DIR"
unzip -qo "$TEMPLATE_TPZ" -d "$OUT_DIR"

python3 - <<PY
from pathlib import Path

root = Path("$ROOT")
loader = root / "wechat-godot/godot-loader.js"
patch = (root / "scripts/wechat/godot-loader.patch.js").read_text(encoding="utf-8").strip()
text = loader.read_text(encoding="utf-8")
needle = 'loadGameEngine(){wx.loadSubpackage({complete:t=>{},name:"engine",success:()=>{this.progress=1,this.updateProgress(this.progress,this.config.textConfig.initText)}}).onProgressUpdate((({progress:t})=>{console.log("progress:",t),this.progress=t/100,this.updateProgress(this.progress,this.config.textConfig.downloadingText[0])}))}'
if needle not in text:
    raise SystemExit("godot-loader.js 模板已变更，请更新 scripts/wechat/godot-loader.patch.js")
loader.write_text(text.replace(needle, patch.rstrip()), encoding="utf-8")
print("已修补 godot-loader.js")
PY

echo "==> 导出 Godot 资源包（微信线不打包字体，避免 WASM 字体崩溃）"
FONT_DIR="$GODOT_DIR/art/fonts"
FONT_STASH="$(mktemp -d)"
FONT_STASHED=0
if [[ -d "$FONT_DIR" ]]; then
  mv "$FONT_DIR" "$FONT_STASH/fonts"
  FONT_STASHED=1
fi

PCK_OUT="$OUT_DIR/engine/demo-pck.pck"
PCK_BIN="$OUT_DIR/engine/demo-pck.bin"
rm -f "$PCK_OUT" "$PCK_BIN"
"$GODOT_BIN" --path "$GODOT_DIR" --headless --export-pack "微信小游戏" "$PCK_OUT"

if [[ "$FONT_STASHED" -eq 1 ]]; then
  mv "$FONT_STASH/fonts" "$FONT_DIR"
  rmdir "$FONT_STASH" 2>/dev/null || true
fi

if [[ -f "$PCK_OUT" ]]; then
  mv -f "$PCK_OUT" "$PCK_BIN"
fi
if [[ ! -f "$PCK_BIN" ]]; then
  echo "导出失败：未找到 $PCK_BIN"
  exit 1
fi
python3 - <<PY
from pathlib import Path
data = Path("$PCK_BIN").read_bytes()
print(f"PCK 大小: {len(data) // 1024} KB, 含字体: {b'SourceHan' in data}")
if b"SourceHan" in data:
    raise SystemExit("导出包仍含字体文件，请检查构建脚本")
PY

echo "==> 写入微信配置"
python3 - <<PY
import json
from pathlib import Path

root = Path("$ROOT")
out = root / "wechat-godot"
proj_cfg = json.loads((out / "project.config.json").read_text(encoding="utf-8"))
proj_cfg["appid"] = "wx66bc130bc0543621"
proj_cfg["projectname"] = "无尽纹章"
(out / "project.config.json").write_text(json.dumps(proj_cfg, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")

game_cfg = json.loads((out / "game.json").read_text(encoding="utf-8"))
game_cfg["deviceOrientation"] = "portrait"
(out / "game.json").write_text(json.dumps(game_cfg, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")
print("appid -> wx66bc130bc0543621")
PY

if [[ -f "$GODOT_DIR/art/bg/deploy_bg.png" ]]; then
  sips -s format jpeg "$GODOT_DIR/art/bg/deploy_bg.png" --out "$OUT_DIR/images/background.jpg" >/dev/null
fi

echo "==> 包体概览"
du -sh "$OUT_DIR/engine" "$OUT_DIR"/* 2>/dev/null | sort -hr | head -10
echo "完成。请用微信开发者工具打开: $OUT_DIR"
