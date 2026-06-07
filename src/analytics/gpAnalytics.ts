/**
 * 经分打点占位（后续接入 @gp/analytics-sdk 或轻量 adapter）。
 * 现在只导出 GameKey，保证全项目统一引用。
 */
import { GAME_KEY } from '@/config/gameKey';

export { GAME_KEY };

/** 经分 ingest 端点（与 xiao_chu 共用 CloudBase 环境） */
export const ANALYTICS_ENDPOINT =
  'https://rosa-env-d7grf78r5dbd37323.service.tcloudbase.com/analytics-ingest/track';
