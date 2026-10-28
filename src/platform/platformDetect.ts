/**
 * 宿主识别。抖音必须排在微信前面：抖音里同时存在的 wx 只是兼容层，
 * 认成微信会把登录和存档写进微信集合。
 *
 * minigame/pixi-adapter/platform.js 与 game.js 有一份等价判断，改这里要一起改。
 */
declare const wx: any;
declare const tt: any;

export type PlatformName = 'wechat' | 'douyin' | 'web';

/** 后端 /login 的 platform 字段。抖音必须是 dy，对应集合 wujin_wenzhang_tt_* */
export type BackendPlatformCode = 'wx' | 'dy' | 'anon';

export function detectMinigamePlatform(): PlatformName {
  if (typeof tt !== 'undefined') return 'douyin';
  if (typeof wx !== 'undefined') return 'wechat';
  return 'web';
}

/** 抖音只取 tt，微信只取 wx。不要在抖音上退回 wx。 */
export function getNativePlatformApi(): any | null {
  const name = detectMinigamePlatform();
  if (name === 'douyin') return typeof tt !== 'undefined' ? tt : null;
  if (name === 'wechat') return typeof wx !== 'undefined' ? wx : null;
  return null;
}

export function toBackendPlatformCode(platform: PlatformName = detectMinigamePlatform()): BackendPlatformCode {
  if (platform === 'wechat') return 'wx';
  if (platform === 'douyin') return 'dy';
  return 'anon';
}
