import { API_PREFIX, CLOUDBASE_API_BASE_URL, GAME_KEY } from '@/config/gameKey';

/** CloudBase HTTP 访问服务根域名（不含路径） */
export const BACKEND_BASE_URL = CLOUDBASE_API_BASE_URL;

/** HTTP 访问服务挂载路径前缀，例如 /wujin-wenzhang-api */
export const BACKEND_PATH_PREFIX = API_PREFIX;

export const BACKEND_LOGIN_PATH = `${BACKEND_PATH_PREFIX}/login`;
export const BACKEND_PULL_PATH = `${BACKEND_PATH_PREFIX}/save/pull`;
export const BACKEND_PUSH_PATH = `${BACKEND_PATH_PREFIX}/save/push`;
export const BACKEND_HEALTH_PATH = `${BACKEND_PATH_PREFIX}/health`;

export const BACKEND_REQUEST_TIMEOUT_MS = 10000;

/** 本地 Token 缓存 key（仅本地，不纳入云同步） */
export const BACKEND_TOKEN_KEY = `${GAME_KEY}_token`;
/** 匿名（H5 / 无平台 code）场景的稳定设备 ID key */
export const BACKEND_ANON_ID_KEY = `${GAME_KEY}_anon_id`;

export const CLOUD_SYNC_SCHEMA_VERSION = 1;
export const CLOUD_SYNC_META_KEY = `${GAME_KEY}_cloud_meta`;

/** 与 SaveManager 一致：长期档 + 当前一局 */
export const SAVE_META_KEY = 'srpg_meta_v3';
export const SAVE_RUN_KEY = 'srpg_run_v4';

/** 云同步白名单：只有列表里的 key 会被打包上云，其余仅本地 */
export const CLOUD_SYNC_ALLOWLIST = [
  SAVE_META_KEY,
  SAVE_RUN_KEY,
] as const;

export const CLOUD_SYNC_EXCLUDE_KEYS = [
  BACKEND_TOKEN_KEY,
  BACKEND_ANON_ID_KEY,
  CLOUD_SYNC_META_KEY,
] as const;

export const CLOUD_SYNC_STARTUP_TIMEOUT_MS = 2500;
export const CLOUD_SYNC_DEBOUNCE_MS = 1500;
export const CLOUD_SYNC_BASE_DELAY_MS = 1500;
export const CLOUD_SYNC_MAX_BACKOFF_MS = 30000;
export const CLOUD_SYNC_MAX_FAIL_COUNT = 5;
export const CLOUD_SYNC_RETRY_INTERVAL_MS = 60000;
export const CLOUD_SYNC_LOG_THRESHOLD = 3;

export type CloudSyncKey = typeof CLOUD_SYNC_ALLOWLIST[number];
