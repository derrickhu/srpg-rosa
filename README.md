# 无尽纹章（srpg-rosa）

微信小游戏：**TypeScript + Pixi 7 + Vite** 构建为 `minigame/game-bundle.js`，入口 `game.js` 加载 `minigame/pixi-adapter` 与 bundle。

策划案：[docs/无尽纹章-战棋休闲IAA小游戏策划案.md](docs/无尽纹章-战棋休闲IAA小游戏策划案.md)

MVP 与全案差异：[docs/MVP-DEVIATIONS.md](docs/MVP-DEVIATIONS.md)（当前工程已实现 **3 关布阵→自动战→商店** 闭环）

Pixi 微信真机踩坑（自 huahua 同步）：[docs/PixiJS微信小游戏真机适配踩坑记录.md](docs/PixiJS微信小游戏真机适配踩坑记录.md)

**构建与发布步骤（人工配合）** 见 [BUILD.md](BUILD.md)。

## 常用命令

```bash
npm install
npm run build
```

用微信开发者工具打开 **本仓库根目录**（含 `project.config.json`）。

## 目录结构

```
├── src/
│   ├── main.ts                 // 入口 + GameFlow
│   ├── core/pixiUnsafeEvalPatch.ts
│   ├── battle/                 // 战棋纯逻辑（引擎/AI/伤害）
│   ├── data/                   // 兵种表 + MVP 三关
│   ├── game/MvpState.ts        // 局内状态机数据
│   ├── view/                   // 布阵 / 结算 / 商店 UI
│   ├── platform/wxPlatform.ts
│   └── config/constants.ts
├── minigame/
│   ├── pixi-adapter/           // 微信 DOM/Canvas 适配（勿删）
│   ├── weapp-adapter.js      // 兼容占位
│   └── game-bundle.js        // npm run build 生成
├── game.js                     // 小游戏入口
├── game.json
├── package.json
├── vite.config.ts
├── project.config.json
└── docs/
```

## 技术说明

- 玩法与关卡以 **代码 + 配置表** 为主，不依赖 Cocos/Godot 编辑器。
- 与既有项目 `game2D_huahua` 使用同一套 Pixi 微信适配思路。
