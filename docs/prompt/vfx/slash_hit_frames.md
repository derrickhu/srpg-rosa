# 普攻刀光序列帧 — 黑底 Additive

> 完整管线见 skill：`~/.cursor/skills/game-vfx-pipeline`  
> 资产目录：`../game_assets/srpg-rosa/assets/vfx/slash_hit/`  
> 生图：Cursor 内置 `GenerateImage`（Gemini 已屏蔽）

## 共用约束（每帧提示词末尾都带上）

- 2D game VFX sprite for tactical SRPG
- PURE BLACK background only (#000000), no gradient, no floor, no character, no weapon silhouette, no text, no watermark
- Single centered energy slash arc, flat 2D illustration
- High contrast, crisp edges, no motion blur, no smoke cloud
- Bright white core with soft golden-orange outer glow
- Effect occupies about 55-65% of frame center
- Rest of image must be completely pure black

## 各帧描述

### slash_00 — 出现
Frame 1 of sword slash hit effect sequence. Thin crescent energy arc just forming, curving from upper-left toward lower-right, a few tiny sparks at the leading edge, moderate brightness.

### slash_01 — 展开
Frame 2 of sword slash hit effect sequence. Arc widening and brightening, clearer crescent slash trail, more visible golden glow halo, still compact.

### slash_02 — 峰值
Frame 3 of sword slash hit effect sequence. Peak impact moment, brightest white-hot core, full slash arc at maximum intensity, strongest golden glow.

### slash_03 — 碎裂
Frame 4 of sword slash hit effect sequence. Arc breaking into light shards and streaks, brightness decreasing, edges dissolving into sparks.

### slash_04 — 消散
Frame 5 of sword slash hit effect sequence. Mostly faded, only a few small ember sparks and faint glow remnants, nearly gone.
