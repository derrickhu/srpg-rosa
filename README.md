# 无尽纹章（srpg-rosa）

微信小游戏：**TypeScript + Pixi 7 + Vite** 构建为 `minigame/game-bundle.js`，入口 `game.js` 加载 `minigame/pixi-adapter` 与 bundle。

策划案：[docs/无尽纹章-战棋休闲IAA小游戏策划案.md](docs/无尽纹章-战棋休闲IAA小游戏策划案.md)

当前系统设计：[docs/当前系统设计文档.md](docs/当前系统设计文档.md)（局外养成 + 局内肉鸽，Tab 大厅 / 章节地图 / 轻交互战斗）

美术风格圣经：[docs/美术风格圣经.md](docs/美术风格圣经.md)（配色编码 / 剪影规则 / 风格禁区，所有生图 prompt 的唯一事实来源）

Pixi 微信真机踩坑（自 huahua 同步）：[docs/PixiJS微信小游戏真机适配踩坑记录.md](docs/PixiJS微信小游戏真机适配踩坑记录.md)

**构建与发布步骤（人工配合）** 见 [BUILD.md](BUILD.md)。

## 常用命令

```bash
npm install
npm run build
```

用微信开发者工具打开 **本仓库根目录**（含 `project.config.json`）。

**GameKey / CDN / 经分** 见 [docs/cloudbase-wujin-wenzhang.md](docs/cloudbase-wujin-wenzhang.md)（`wujin_wenzhang` = 无尽纹章）。

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
│   ├── config/gameKey.ts       // GAME_KEY = wujin_wenzhang
│   ├── config/cdnConfig.ts     // CDN 目录与 CloudBase 域名
│   └── config/constants.ts
├── config/game.json            // GameKey + CDN 唯一配置源
├── scripts/upload_cdn.js       // CDN 增量上传（对齐 xiao_chu）
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
