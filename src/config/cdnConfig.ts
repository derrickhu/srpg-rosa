import gameConfig from '../../config/game.json';

import { GAME_KEY } from './gameKey';

/**
 * CloudBase COS CDN 配置（与 xiao_chu 同环境、按 GameKey 隔离远端目录）。
 *
 * 逻辑路径（代码里写的 `images/terrain/forest.png`）不变；
 * 远端对象路径为 `{cdnFilePrefix}/images/terrain/forest.png`。
 */
export const cdnConfig = {
  gameKey: GAME_KEY,
  cloudbaseEnv: gameConfig.cloudbaseEnv,
  cloudbaseBucket: gameConfig.cloudbaseBucket,
  cloudbasePublicBaseUrl: gameConfig.cloudbasePublicBaseUrl.replace(/\/+$/, ''),
  /** 远端前缀，默认 wujin_wenzhang/assets_cdn */
  cloudbaseFilePrefix: gameConfig.cdnFilePrefix.replace(/^\/+|\/+$/g, ''),
  /** 走 CDN 按需下载的目录（瘦包时可不打进 code 包） */
  cdnDirs: [...gameConfig.cdnDirs],
  /** 随包内置的目录（首屏/UI 关键资源） */
  bundledDirs: [...gameConfig.bundledDirs],
  ignoreFiles: [...gameConfig.ignoreFiles],
  /** 开发调试 CDN 解析时可设为 true */
  debugCdn: false,
} as const;

export type CdnConfig = typeof cdnConfig;
