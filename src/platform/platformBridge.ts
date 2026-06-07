/**
 * 微信 / 抖音等平台能力桥接（AssetLoader、后续 API 客户端共用）。
 * 对齐 xiao_chu/js/platform.js 的最小子集。
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const wx: any;
declare const tt: any;
declare const GameGlobal: any;
/* eslint-enable @typescript-eslint/no-explicit-any */

function baseApi(): any {
  if (typeof wx !== 'undefined') return wx;
  if (typeof tt !== 'undefined') return tt;
  if (typeof GameGlobal !== 'undefined') {
    return (GameGlobal as { wx?: unknown; tt?: unknown }).wx
      ?? (GameGlobal as { wx?: unknown; tt?: unknown }).tt
      ?? GameGlobal;
  }
  return null;
}

export function getFileSystemManager(): any {
  const base = baseApi();
  return base?.getFileSystemManager?.() ?? null;
}

export function getUserDataPath(): string {
  const base = baseApi();
  return String(base?.env?.USER_DATA_PATH ?? '');
}

export function downloadFile(opts: {
  url: string;
  success?: (res: { tempFilePath?: string }) => void;
  fail?: (err: unknown) => void;
}): void {
  const base = baseApi();
  if (typeof base?.downloadFile === 'function') {
    base.downloadFile(opts);
    return;
  }
  opts.fail?.({ errMsg: 'downloadFile unavailable' });
}

export function request(opts: {
  url: string;
  method?: string;
  header?: Record<string, string>;
  data?: unknown;
  success?: (res: { data?: unknown; statusCode?: number }) => void;
  fail?: (err: unknown) => void;
}): void {
  const base = baseApi();
  if (typeof base?.request === 'function') {
    base.request(opts);
    return;
  }
  opts.fail?.({ errMsg: 'request unavailable' });
}
