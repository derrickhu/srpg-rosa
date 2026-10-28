/**
 * 多平台数据隔离。
 *
 * - 微信 / 浏览器：wujin_wenzhang_{suffix}，与已上线存档逐字一致
 * - 抖音：wujin_wenzhang_tt_{suffix}
 *
 * 隔离：本地存储 key、云端集合（云函数按 login 的 platform=dy 写 wujin_wenzhang_tt_playerData）。
 * 不隔离：HTTP 路径仍是 /wujin-wenzhang-api，经分 gameKey 仍是 wujin_wenzhang。
 */
import { GAME_KEY } from '@/config/gameKey';
import { detectMinigamePlatform, type PlatformName } from '@/platform/platformDetect';

export const BASE_GAME_KEY = GAME_KEY;

export type PlatformScopeSegment = 'tt';

const PLATFORM_SCOPE: Partial<Record<PlatformName, PlatformScopeSegment>> = {
  douyin: 'tt',
};

export function getPlatformScope(platform: PlatformName = detectMinigamePlatform()): PlatformScopeSegment | null {
  return PLATFORM_SCOPE[platform] ?? null;
}

export function getScopedGameKey(platform: PlatformName = detectMinigamePlatform()): string {
  const scope = getPlatformScope(platform);
  return scope ? `${BASE_GAME_KEY}_${scope}` : BASE_GAME_KEY;
}

/**
 * 业务 key 映射到当前平台。微信原样返回。
 * 已带 wujin_wenzhang_tt_ 的 key 不会再加一次。
 * 经分 SDK 自带前缀的 key 也加命名空间，避免两端共用匿名 ID。
 */
export function scopeStorageKey(key: string, platform: PlatformName = detectMinigamePlatform()): string {
  const scope = getPlatformScope(platform);
  if (!scope || !key) return key;

  const scopedPrefix = `${BASE_GAME_KEY}_${scope}`;
  if (key === scopedPrefix || key.startsWith(`${scopedPrefix}_`)) return key;
  if (key === BASE_GAME_KEY) return scopedPrefix;
  if (key.startsWith(`${BASE_GAME_KEY}_`)) {
    return `${scopedPrefix}_${key.slice(BASE_GAME_KEY.length + 1)}`;
  }
  return `${scopedPrefix}_${key}`;
}
