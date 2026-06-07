import gameConfig from '../../config/game.json';

/** 经分 / CloudBase / CDN 统一 GameKey（snake_case，与 game-analysis、资产库一致） */
export const GAME_KEY = gameConfig.gameKey;

/** 中文展示名 */
export const GAME_TITLE = gameConfig.displayName;

/** 环境变量前缀，如 WUJIN_WENZHANG_JWT_SECRET */
export const GAME_KEY_UPPER = GAME_KEY.toUpperCase();

/** CloudBase HTTP 路径前缀（下划线转连字符，避免网关 400） */
export const GAME_KEY_HYPHEN = GAME_KEY.replace(/_/g, '-');

/** 统一后端 API 前缀，例如 /wujin-wenzhang-api */
export const API_PREFIX = `/${GAME_KEY_HYPHEN}-api`;

/** CloudBase HTTP 访问服务根域名（后续 wujin-wenzhang-api 云函数挂在此域名下） */
export const CLOUDBASE_API_BASE_URL = gameConfig.cloudbaseApiBaseUrl;

/** 集合名前缀，例如 wujin_wenzhang_playerData */
export function collectionName(suffix: string): string {
  const normalized = suffix.replace(/^_+/, '');
  return `${GAME_KEY}_${normalized}`;
}
