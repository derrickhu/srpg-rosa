# 无尽纹章 — 构建与真机调试（人工配合 SOP）

面向：**不写业务代码**，只负责环境、构建、微信工具与发布配置的同学。

## 1. 一次性环境

1. 安装 **Node.js LTS**（建议 20.x 或以上）[https://nodejs.org/](https://nodejs.org/)
2. 克隆本仓库后，在**仓库根目录**（与 `project.config.json` 同级）执行：

```bash
cd srpg-rosa
npm install
```

## 2. 每次改代码后

在仓库根目录执行：

```bash
npm run build
```

- 产物：`minigame/game-bundle.js`（由 Vite 生成，**不要手改**）。
- `minigame/pixi-adapter/` 为从既有项目复制的微信适配层，构建时 **不会** 被清空（`vite` 配置 `emptyOutDir: false`）。

持续编译可用：

```bash
npm run dev
```

（另开终端；保存源码后自动重新打出 `game-bundle.js`。）

## 3. 微信开发者工具打开哪个目录

请用 **微信开发者工具** 打开 **本仓库根目录**（包含 `game.js`、`game.json`、`project.config.json` 的那一层）。

- 游戏入口：`game.js` → 依次 `require('./minigame/pixi-adapter/index')` 与 `require('./minigame/game-bundle.js')`。
- **不要**只打开 `minigame` 子目录作为工程根（根目录没有 `project.config.json` 时，工具链与当前团队习惯不一致）。

## 4. 广告位 ID（占位键名）

业务代码里用常量键名占位，真 ID 在公众平台创建「广告管理」后填入，建议**本地私有不提交**或单独 `local.config`（勿把真实线上 ID 提交到公开仓库）。

| 用途 | 代码中的键名参考 | 定义位置 |
|------|------------------|----------|
| 战败复活激励视频 | `AdConfigKeys.rewardRevive` | [src/platform/wxPlatform.ts](src/platform/wxPlatform.ts) |
| 商店免费刷新激励视频 | `AdConfigKeys.rewardShopRefresh` | 同上 |

接入时由开发在调用 `wx.createRewardedVideoAd` 处读取上述配置即可；配合同学只需在文档或表格里维护「键 → 真实 adunit」对照。

## 5. 常见问题：白屏 / 无字 / 控制台报错

按顺序自查：

1. **是否已执行 `npm run build`**  
   若缺少 `minigame/game-bundle.js`，运行时会直接失败。

2. **控制台是否有 `unsafe-eval` / Shader 相关报错**  
   工程已包含与 `game2D_huahua` 同思路的 `writeBundle` 补丁（`vite.config.ts` 内 `pixiUnsafeEvalPlugin`）及 [src/core/pixiUnsafeEvalPatch.ts](src/core/pixiUnsafeEvalPatch.ts)。若仍报错，把**完整报错与基础库版本**发给开发。

3. **真机与模拟器差异**  
   patch 内对真机 `Texture.WHITE`、Canvas 纹理等有特殊处理；请在 **真机预览** 与 **开发者工具** 各测一遍，并说明哪一侧异常。

4. **`GameGlobal.canvas` 不可用**  
   多为适配层未加载或加载顺序错误；确认入口为根目录 `game.js` 且未改 `require` 顺序。

5. **模拟器全黑、无报错**  
   多为 **canvas 宽高为 0** 或 **PIXI.Application 不完整**。见 [`src/boot/createPixiApp.ts`](src/boot/createPixiApp.ts) 的降级逻辑。

6. **画面缩在左上角、大小不对**  
   多为 **canvas 用了物理像素（× DPR）而 UI 仍按逻辑像素排版**。当前工程已改为 **`windowWidth` × `windowHeight` 逻辑尺寸** 与 Pixi 一致；若日后要做 huahua 级高清 + 设计稿缩放，再单独加整 `stage` 缩放即可。

## 6. 与参考工程的关系

微信 + Pixi 适配与构建链路与本地项目 **`game2D_huahua`** 对齐；复杂问题可对照其 `vite.config.ts` 与 `pixiUnsafeEvalPatch` 行为排查。

更系统的真机问题清单见仓库内 **[PixiJS 微信小游戏真机适配踩坑记录.md](docs/PixiJS微信小游戏真机适配踩坑记录.md)**（从 huahua 同步）。

---

## 7. Godot 线 → 微信小游戏（`wechat-godot/`）

与 Pixi 的 `minigame/` **并行**，互不影响。

### 一次性准备

1. 仓库已包含 `tools/godot/Godot.app`（4.6.3）与 `godot/addons/godot-minigame/` 插件（macOS 需本地编译一次，见 `godothub/godot-minigame`）。
2. 安装 **微信开发者工具**。

### 每次改 Godot 工程后

在仓库根目录：

```bash
npm run build:godot
```

产物目录：`wechat-godot/`（`engine/` 为微信 **分包**，含 `godot.wasm.br` + `demo-pck.bin`）。

### 微信开发者工具

1. **打开目录**：`wechat-godot/`（不是仓库根目录）。
2. **启用 WASM**：设置 → 通用设置 → 打开浏览器实验性设置 → **Experimental WebAssembly (Enabled)**，重启工具（见 `wechat-godot/使用前阅读.md`）。
3. AppID 已写入 `project.config.json`：`wx66bc130bc0543621`。

### 包体说明（P0）

- 主包：入口 JS + 加载页（< 4MB）。
- `engine` 分包：约 23MB（wasm + 游戏 PCK），在 30MB 总量限制内。
- 字体仍偏大（思源 Bold ~16MB 在 PCK 内），P1 需子集化或迁 CDN。
