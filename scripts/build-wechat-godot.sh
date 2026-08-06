#!/usr/bin/env bash
# Godot → 微信小游戏（wechat-godot/）
# 用法：./scripts/build-wechat-godot.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GODOT_DIR="$ROOT/godot"
OUT_DIR="${OUT_DIR:-$ROOT/wechat-godot}"
GODOT_BIN="${GODOT_BIN:-$ROOT/tools/godot-4.6.2/Godot.app/Contents/MacOS/Godot}"
TEMPLATE_TPZ="${TEMPLATE_TPZ:-/tmp/minigame4.6.2.tpz}"
TEMPLATE_URL="${TEMPLATE_URL:-https://github.com/godothub/godot-minigame/releases/download/4.6.2/minigame4.6.2.tpz}"
WECHAT_APPID="${WECHAT_APPID:-}"

if [[ ! -x "$GODOT_BIN" ]]; then
  echo "缺少 Godot：$GODOT_BIN"
  echo "请解压 Godot 4.6.x 到 tools/godot/，或设置 GODOT_BIN"
  exit 1
fi

echo "==> 生成微信用位图字库"
python3 "$ROOT/scripts/build-bitmap-font.py"

echo "==> 准备微信小游戏壳（模板 4.6.2）"
if [[ ! -f "$TEMPLATE_TPZ" ]]; then
  echo "下载模板: $TEMPLATE_URL"
  curl -sL -o "$TEMPLATE_TPZ" "$TEMPLATE_URL"
fi
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
unzip -qo "$TEMPLATE_TPZ" -d "$OUT_DIR"

python3 - <<PY
from pathlib import Path

root = Path("$ROOT")
loader = Path("$OUT_DIR") / "godot-loader.js"
patch = (root / "scripts/wechat/godot-loader.patch.js").read_text(encoding="utf-8").strip()
text = loader.read_text(encoding="utf-8")
needle = 'loadGameEngine(){wx.loadSubpackage({complete:t=>{},name:"engine",success:()=>{this.progress=1,this.updateProgress(this.progress,this.config.textConfig.initText)}}).onProgressUpdate((({progress:t})=>{console.log("progress:",t),this.progress=t/100,this.updateProgress(this.progress,this.config.textConfig.downloadingText[0])}))}'
if needle not in text:
    raise SystemExit("godot-loader.js 模板已变更，请更新 scripts/wechat/godot-loader.patch.js")
text = text.replace(needle, patch.rstrip())
fragile_context = 'this.onScreenCanvas.getContext("webgl2",{alpha:!1,antialias:!1,depth:!0,enableExtensionsByDefault:1,explicitSwapControl:1,failIfMajorPerformanceCaveat:!1,majorVersion:2,minorVersion:0,powerPreference:"default",premultipliedAlpha:!0,preserveDrawingBuffer:!0,proxyContextToMainThread:0,renderViaOffscreenBackBuffer:!0,stencil:!1})'
wechat_context = 'this.onScreenCanvas.getContext("webgl2",{alpha:!1,antialias:!1,depth:!0,stencil:!1})||this.onScreenCanvas.getContext("webgl",{alpha:!1,antialias:!1,depth:!0,stencil:!1})'
if fragile_context not in text:
    raise SystemExit("godot-loader.js WebGL 初始化片段已变更，请更新构建脚本")
text = text.replace(fragile_context, wechat_context)
loader.write_text(text, encoding="utf-8")
print("已修补 godot-loader.js")
PY

echo "==> 导出 Godot 资源包（位图字库，不加载 FontFile）"
FONT_DIR="$GODOT_DIR/art/fonts"
FONT_STASH="$(mktemp -d)"

restore_stashed_fonts() {
  if [[ -d "$FONT_STASH/fonts" ]]; then
    rm -rf "$FONT_DIR"
    mv "$FONT_STASH/fonts" "$FONT_DIR"
  fi
  rmdir "$FONT_STASH" 2>/dev/null || true
}
trap restore_stashed_fonts EXIT

if [[ -d "$FONT_DIR" ]]; then
  mv "$FONT_DIR" "$FONT_STASH/fonts"
fi

PCK_OUT="$OUT_DIR/engine/demo-pck-untyped-main.pck"
PCK_BIN="$OUT_DIR/engine/demo-pck-untyped-main.bin"
rm -f "$OUT_DIR"/engine/demo-pck*.pck "$OUT_DIR"/engine/demo-pck*.bin
"$GODOT_BIN" --path "$GODOT_DIR" --headless --export-pack "微信小游戏" "$PCK_OUT"

restore_stashed_fonts
trap - EXIT

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
size_kb = len(data) // 1024
has_subset = b"SourceHanSansSC-Bold-subset" in data
has_source_marker = b"SourceHanSansSC-Medium" in data or b"SourceHanSansSC-Regular" in data
has_bitmap = b"bitmap_font" in data or b"BitmapFontData" in data
has_fontfile = b"font_data_dynamic" in data or b"SourceHanSansSC-Bold-subset" in data
print(f"PCK 大小: {size_kb} KB, 含位图字库: {has_bitmap}, 含 FontFile: {has_fontfile}")
if not has_bitmap:
    raise SystemExit("导出包缺少位图字库，请检查 build-bitmap-font.py")
if has_fontfile:
    raise SystemExit("导出包仍含 FontFile，请检查 export_presets.cfg 与 theme")
if size_kb > 8192:
    raise SystemExit("导出包过大，可能误打入完整字体源，请检查构建脚本")
PY

echo "==> 写入微信配置"
python3 - <<PY
import json
from pathlib import Path

root = Path("$ROOT")
out = Path("$OUT_DIR")

proj_cfg = json.loads((out / "project.config.json").read_text(encoding="utf-8"))
if "$WECHAT_APPID":
    proj_cfg["appid"] = "$WECHAT_APPID"
else:
    proj_cfg.pop("appid", None)
proj_cfg["projectname"] = "无尽纹章-Godot新包"
(out / "project.config.json").write_text(json.dumps(proj_cfg, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")

private_cfg_path = out / "project.private.config.json"
if private_cfg_path.exists():
    private_cfg = json.loads(private_cfg_path.read_text(encoding="utf-8"))
    private_cfg["projectname"] = "无尽纹章-Godot新包"
    private_cfg["libVersion"] = proj_cfg.get("libVersion", "latest")
    if "$WECHAT_APPID":
        private_cfg["appid"] = "$WECHAT_APPID"
    else:
        private_cfg.pop("appid", None)
    private_cfg_path.write_text(json.dumps(private_cfg, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")

game_cfg = json.loads((out / "game.json").read_text(encoding="utf-8"))
game_cfg["deviceOrientation"] = "portrait"
(out / "game.json").write_text(json.dumps(game_cfg, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")

entry = (root / "scripts/wechat/godot-game.entry.js").read_text(encoding="utf-8")
(out / "engine/game.js").write_text(entry, encoding="utf-8")
root_entry = out / "game.js"
root_entry.write_text("""console.log('[boot] root entry: bitmap-font minimal-loader')
console.log('[boot] before require weapp-adapter')
require('./weapp-adapter')
console.log('[boot] after require weapp-adapter', { hasCanvas: typeof canvas !== 'undefined' })

function showBootLoading(title) {
    try {
        wx.showLoading({ title, mask: true })
    } catch (err) {
        console.warn('[boot] showLoading failed', err)
    }
}

const config = {
    textConfig: {
        firstStartText: 'Godot新包首次加载',
        downloadingText: ['加载引擎分包', '编译 WASM', '请稍候'],
        compilingText: '编译中',
        initText: 'Godot引擎初始化中',
        completeText: '开始游戏',
        textDuration: 1500,
        style: { color: '#ffffff', fontSize: 14 },
    },
    barConfig: { style: {} },
    iconConfig: { visible: false, style: {} },
    materialConfig: { backgroundImage: '', backgroundVideo: '', iconImage: '' },
}

GameGlobal.godotLoader = {
    config,
    currentText: config.textConfig.firstStartText,
    cleanup() {
        console.log('[boot] loader cleanup')
        try {
            wx.hideLoading()
        } catch (_) {}
    },
}

showBootLoading('加载 Godot 0%')
const task = wx.loadSubpackage({
    name: 'engine',
    success() {
        console.log('[boot] engine subpackage success')
        showBootLoading('启动 Godot')
        try {
            require('./engine/game.js')
            console.log('[boot] engine entry require returned')
        } catch (err) {
            console.error('[boot] engine entry failed', err)
            try {
                wx.hideLoading()
                wx.showModal({ title: 'Godot启动失败', content: String(err && (err.stack || err.message || err)), showCancel: false })
            } catch (_) {}
        }
    },
    fail(err) {
        console.error('[boot] engine subpackage failed', err)
        try {
            wx.hideLoading()
            wx.showModal({ title: '引擎分包加载失败', content: JSON.stringify(err), showCancel: false })
        } catch (_) {}
    },
})
task.onProgressUpdate(({ progress }) => {
    console.log('[boot] engine progress', progress)
    showBootLoading('加载 Godot ' + progress + '%')
})
""", encoding="utf-8")
print("已写入 engine/game.js")
PY

if [[ -f "$GODOT_DIR/art/bg/deploy_bg.png" ]]; then
  sips -s format jpeg "$GODOT_DIR/art/bg/deploy_bg.png" --out "$OUT_DIR/images/background.jpg" >/dev/null
fi

echo "==> 包体概览"
du -sh "$OUT_DIR/engine" "$OUT_DIR"/* 2>/dev/null | sort -hr | head -10
echo ""
echo "完成。请用微信开发者工具打开: $OUT_DIR"
