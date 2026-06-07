# SRPG-rosa 生图与资源规范（同步版）

## 生图工具（2026-06）

| 优先级 | 工具 | 状态 |
|--------|------|------|
| **1 — 默认** | Cursor 内置 `GenerateImage` | 使用中 |
| ~~Gemini~~ | `gemini-image-gen` skill | **已屏蔽**（API key 不可用）；文件保留，用户明确要求恢复前勿调用 |

## 流程

1. **必须先写提示词**，保存于本仓库 `docs/prompt/`（VFX 放 `docs/prompt/vfx/`）。
2. **出图**：用 Cursor 内置 `GenerateImage` 按提示词生成；生成后复制到 `game_assets`（见下）。~~不再默认走 Gemini `generate_images.py`。~~
3. **生成图与中间处理图**一律放入 **`/Users/rosa/rosa_games/game_assets/srpg-rosa/assets`**，可按主题建子目录（如 `terrain/raw/`、`vfx/slash_hit/raw/`）。
4. **角色/UI 抠图**：使用 **remove-background / rembg** skill；**禁止色键抠图**；成品仍放在 **game_assets**，**不直接写入游戏仓库**。
5. **战斗 VFX（黑底 Additive）**：使用 **`game-vfx-pipeline` skill**；**禁止 rembg**；压黑后同步到 `godot/art/vfx/`。
6. **入库**：待你确认后，再复制或同步到游戏内资源目录。

## 目录约定（示例）

| 阶段 | 路径示例 |
|------|-----------|
| 提示词 | `docs/prompt/**/*.md` / `*.txt` |
| 模型直出 | `.../assets/<主题>/raw/` |
| 抠图后 | `.../assets/<主题>/nobg/` |
| VFX 压黑后 | `.../assets/vfx/<effect_id>/final/` |
| Godot 运行时 | `godot/art/vfx/<effect_id>/frames/`（确认后同步） |

## 相关 Skills

- 角色 / UI / 地形网格：`game-art-pipeline`
- 攻击 / 技能光效：`game-vfx-pipeline`
- ~~Gemini 出图~~：`gemini-image-gen`（已屏蔽，保留备查）
