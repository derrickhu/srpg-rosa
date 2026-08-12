# CloudBase 统一后端 + CDN 说明（GameKey = `wujin_wenzhang`）

## 标准约束

- **GameKey**：`wujin_wenzhang`（无尽纹章）。经分 SDK、CloudBase 云函数、CDN 远端目录、资产库 `game_assets` 均使用此 key。
- **中文名**：无尽纹章
- **命名规则**（与 `xiao_chu` 一致，仅前缀不同）：
  - 集合前缀：`wujin_wenzhang_*`
  - 环境变量前缀：`WUJIN_WENZHANG_*`
  - CDN 远端前缀：`wujin_wenzhang/assets_cdn/`
  - HTTP API 路径：`/wujin-wenzhang-api`（GameKey 中下划线在 URL 中转为连字符，避免 CloudBase 网关 400）

## 客户端配置入口

| 文件 | 作用 |
|------|------|
| [`config/game.json`](../config/game.json) | **唯一配置源**：GameKey、CloudBase 环境、CDN 域名与目录 |
| [`src/config/gameKey.ts`](../src/config/gameKey.ts) | 导出 `GAME_KEY`、`API_PREFIX`、`collectionName()` |
| [`src/config/cdnConfig.ts`](../src/config/cdnConfig.ts) | 导出 `cdnConfig`（cdnDirs / bundledDirs） |
| [`src/core/AssetLoader.ts`](../src/core/AssetLoader.ts) | CDN 按需下载 + 本地缓存（对齐 xiao_chu `assetLoader.js`） |
| [`src/core/AssetManager.ts`](../src/core/AssetManager.ts) | 加载 bundle 前自动 `resolveOrDownload` |
| [`scripts/upload_cdn.js`](../scripts/upload_cdn.js) | 增量上传 CDN 资源 + 生成 `manifest.json` |

启动日志会打印：`[main] 无尽纹章 (wujin_wenzhang) MVP 启动`。

## CDN 目录策略

逻辑路径（代码里写的路径）与 xiao_chu 相同：**不改游戏内引用，只增加远端前缀**。

| 类型 | 目录 | 说明 |
|------|------|------|
| **CDN**（瘦包可排除） | `images/terrain/`、`images/units/`、`images/fx/`、`images/bg/` | 走 HTTPS 下载 + `USER_DATA_PATH/cdn_cache` |
| **Bundled**（随包） | `images/ui/`、`fonts/`（得意黑展示子集） | 首屏 UI + 展示字体；`packOptions.ignore` 必须排除 `tools/`/`godot/`/`art/` 等，否则上传体积爆炸 |


示例：

- 代码路径：`images/terrain/plain.png`
- 远端 URL：`https://726f-rosa-env-d7grf78r5dbd37323-1414200063.tcb.qcloud.la/wujin_wenzhang/assets_cdn/images/terrain/plain.png`

## 资源放置（仓库内）

将待上传资源放在**仓库根目录**下与逻辑路径一致的文件夹（与 `game.js` 同级），例如：

```text
srpg-rosa/
├── images/
│   ├── terrain/
│   ├── units/
│   ├── fx/
│   ├── bg/
│   └── ui/          # bundled，随包或本地开发
├── config/game.json
└── scripts/upload_cdn.js
```

`src/core/assetBundles.ts` 中的路径已与上述目录对齐。

## CDN 上传

凭据放在 `scripts/.cdn_secret`（勿提交）或环境变量：

```text
TENCENTCLOUD_SECRET_ID=
TENCENTCLOUD_SECRET_KEY=
```

命令：

```bash
# 预览差异
node scripts/upload_cdn.js --dry-run

# 增量上传
npm run upload:cdn

# 全量重传
node scripts/upload_cdn.js --force
```

上传完成后会在远端写入 `wujin_wenzhang/assets_cdn/manifest.json`；客户端启动时 `AssetLoader.prefetchManifest()` 拉取清单用于 hash 校验。

## 经分（后续接入）

打点 `game_key` 必须使用 `wujin_wenzhang`，与 [`game-analysis`](../../game-analysis/src/shared/games.ts) 注册表一致。

```typescript
import { GAME_KEY } from '@/config/gameKey';

// analytics.track({ game_key: GAME_KEY, event_name: 'session_start', ... })
```

接入 `@gp/analytics-sdk` 或轻量 adapter 时，**不要**在业务代码里硬编码字符串，统一从 `gameKey.ts` 导入。

## CloudBase 后端（后续接入）

参考 `xiao_chu/cloudfunctions/xiaochu-api/` 与 [`xiao_chu/docs/cloudbase-xiaochu.md`](../../xiao_chu/docs/cloudbase-xiaochu.md)：

1. 新建云函数 `wujin-wenzhang-api`（路径用连字符）
2. 环境变量 `GAME_KEY=wujin_wenzhang` + `WUJIN_WENZHANG_*` 前缀
3. HTTP 访问服务挂载 `/wujin-wenzhang-api`
4. 客户端 `API_PREFIX` + `CLOUDBASE_API_BASE_URL` 已在 `gameKey.ts` 派生

## 与 xiao_chu 的差异

| 项目 | xiao_chu | wujin_wenzhang |
|------|----------|----------------|
| GameKey | `xiaochu` | `wujin_wenzhang` |
| CDN 前缀 | `xiaochu/assets_cdn` | `wujin_wenzhang/assets_cdn` |
| 技术栈 | 纯 JS 小游戏 | TypeScript + Vite + Pixi |
| 配置 | `js/data/cdnConfig.js` | `config/game.json` + TS 封装 |

CloudBase 环境与 COS 桶与 xiao_chu **共用**（`rosa-env-d7grf78r5dbd37323`），通过 GameKey 前缀隔离对象路径。

## 新同学 Checklist

- [ ] 确认 `config/game.json` 的 `gameKey` 为 `wujin_wenzhang`
- [ ] 业务代码引用 `GAME_KEY`，不要写死字符串
- [ ] 大图放 `cdnDirs`，首屏 UI 放 `bundledDirs`
- [ ] 改资源后跑 `npm run upload:cdn`
- [ ] 经分 / 云函数接入时使用同一 GameKey
