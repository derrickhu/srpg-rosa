/**
 * CDN 资源加载器 — 无尽纹章
 *
 * 方案对齐 xiao_chu/js/data/assetLoader.js：
 * - bundledDirs：随包资源，直接走本地路径
 * - cdnDirs：瘦包排除 → HTTPS CDN 按需下载 + USER_DATA_PATH 缓存
 * - manifest.json：增量校验 hash（上传脚本生成）
 */
import { cdnConfig } from '@/config/cdnConfig';
import {
  downloadFile,
  getFileSystemManager,
  getUserDataPath,
  request,
} from '@/platform/platformBridge';

const CDN_FILE_PREFIX = cdnConfig.cloudbaseFilePrefix;
const CDN_PUBLIC_BASE_URL = cdnConfig.cloudbasePublicBaseUrl;
const CDN_DEBUG = cdnConfig.debugCdn;
const BUNDLED_PREFIXES = cdnConfig.bundledDirs.map((d) => (d.endsWith('/') ? d : `${d}/`));
const CDN_DIRS = cdnConfig.cdnDirs.map((d) => (d.endsWith('/') ? d : `${d}/`));

const fs = getFileSystemManager();
const userDataPath = getUserDataPath();
const CACHE_ROOT = userDataPath ? `${userDataPath}/cdn_cache` : '';

/** 真机 wx.downloadFile / request 合计大约 10 路；一次打满会超时且不回调，Loading 就停在 42%。 */
const DOWNLOAD_CONCURRENCY = 4;
const DOWNLOAD_TIMEOUT_MS = 12000;

let downloadActive = 0;
const downloadWaiters: Array<() => void> = [];

function acquireDownloadSlot(): Promise<void> {
  return new Promise((resolve) => {
    const grant = (): void => {
      downloadActive += 1;
      resolve();
    };
    if (downloadActive < DOWNLOAD_CONCURRENCY) grant();
    else downloadWaiters.push(grant);
  });
}

function releaseDownloadSlot(): void {
  downloadActive = Math.max(0, downloadActive - 1);
  const next = downloadWaiters.shift();
  if (next) next();
}

function downloadFileOnce(url: string): Promise<{ tempFilePath?: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`download timeout after ${DOWNLOAD_TIMEOUT_MS}ms: ${url}`));
    }, DOWNLOAD_TIMEOUT_MS);
    downloadFile({
      url,
      success: (res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(res);
      },
      fail: (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    });
  });
}

interface ManifestFileEntry {
  hash?: string;
  size?: number;
}

interface CdnManifest {
  version?: number;
  gameKey?: string;
  files?: Record<string, ManifestFileEntry>;
}

let manifest: CdnManifest | null = null;
let manifestReady = false;
const localExistsCache = new Map<string, boolean>();
const downloadQueue = new Map<string, Array<(ok: boolean) => void>>();
const runtimeTempUrlCache = new Map<string, string>();

function debugOnce(key: string, ...args: unknown[]): void {
  if (!CDN_DEBUG) return;
  console.log('[AssetLoader]', ...args);
}

function isBundledPath(path: string): boolean {
  return BUNDLED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function isCdnPath(path: string): boolean {
  if (isBundledPath(path)) return false;
  return CDN_DIRS.some((prefix) => path.startsWith(prefix));
}

export function getCdnUrl(logicalPath: string): string {
  const base = `${CDN_PUBLIC_BASE_URL}/${CDN_FILE_PREFIX}/${logicalPath}`;
  const hash = manifest?.files?.[logicalPath]?.hash;
  return hash ? `${base}?h=${hash}` : base;
}

function getCachePath(logicalPath: string): string {
  return `${CACHE_ROOT}/${logicalPath}`;
}

function localFileExists(path: string): boolean {
  const cached = localExistsCache.get(path);
  if (cached !== undefined) return cached;
  if (!fs) {
    localExistsCache.set(path, true);
    return true;
  }
  try {
    fs.accessSync(path);
    localExistsCache.set(path, true);
    return true;
  } catch {
    localExistsCache.set(path, false);
    return false;
  }
}

function cacheFileExists(logicalPath: string): boolean {
  if (!fs || !CACHE_ROOT) return false;
  return localFileExists(getCachePath(logicalPath));
}

/**
 * 包内是否还留着这张图。
 *
 * `packOptions.ignore` 只在**上传/预览打包**时剔除 CDN 目录，开发者工具跑本地项目、
 * 以及尚未瘦包的构建里这些文件都在。此时直接用包内路径，别再走 downloadFile ——
 * 一次要拉近百张，真机并发一满就卡在 Loading 不动。
 */
function packageFileExists(logicalPath: string): boolean {
  if (!fs) return false;
  return localFileExists(logicalPath);
}

function getCachedHash(logicalPath: string): string | null {
  if (!fs) return null;
  try {
    return String(fs.readFileSync(`${getCachePath(logicalPath)}.meta`, 'utf-8')).trim();
  } catch {
    return null;
  }
}

function isCacheValid(logicalPath: string): boolean {
  if (!cacheFileExists(logicalPath)) return false;
  if (!manifest?.files) return true;
  const entry = manifest.files[logicalPath];
  if (!entry?.hash) return true;
  return getCachedHash(logicalPath) === entry.hash;
}

function ensureCacheDir(filePath: string): void {
  if (!fs || !userDataPath) return;
  const dir = filePath.split('/').slice(0, -1).join('/');
  try {
    fs.accessSync(dir);
  } catch {
    const segments = dir.replace(`${userDataPath}/`, '').split('/');
    let cur = userDataPath;
    for (const seg of segments) {
      cur += `/${seg}`;
      try {
        fs.accessSync(cur);
      } catch {
        try {
          fs.mkdirSync(cur, true);
        } catch {
          /* ignore */
        }
      }
    }
  }
}

function finishDownload(logicalPath: string, ok: boolean): void {
  const waiters = downloadQueue.get(logicalPath) ?? [];
  downloadQueue.delete(logicalPath);
  for (const cb of waiters) cb(ok);
}

/** 解析资源路径：bundled → 原路径；CDN 已缓存 → 本地缓存路径；否则 null（需下载） */
export function resolveAsset(path: string): string | null {
  if (isBundledPath(path) || !isCdnPath(path)) return path;

  const tempUrl = runtimeTempUrlCache.get(path);
  if (tempUrl) return tempUrl;

  if (isCacheValid(path)) {
    debugOnce(`hit:${path}`, 'cache hit', path);
    return getCachePath(path);
  }
  if (packageFileExists(path)) {
    debugOnce(`pkg:${path}`, 'package hit', path);
    return path;
  }
  return null;
}

export function downloadAndNotify(logicalPath: string, onComplete?: (ok: boolean) => void): void {
  if (downloadQueue.has(logicalPath)) {
    if (onComplete) downloadQueue.get(logicalPath)!.push(onComplete);
    return;
  }
  downloadQueue.set(logicalPath, onComplete ? [onComplete] : []);

  const url = getCdnUrl(logicalPath);
  const cachePath = getCachePath(logicalPath);
  ensureCacheDir(cachePath);

  void (async () => {
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      await acquireDownloadSlot();
      try {
        const res = await downloadFileOnce(url);
        const temp = res?.tempFilePath ?? '';
        if (!temp) throw new Error('missing tempFilePath');
        if (/^https?:\/\//.test(temp)) {
          runtimeTempUrlCache.set(logicalPath, temp);
          finishDownload(logicalPath, true);
          return;
        }
        if (!fs) {
          finishDownload(logicalPath, false);
          return;
        }
        fs.copyFileSync(temp, cachePath);
        localExistsCache.set(cachePath, true);
        const hash = manifest?.files?.[logicalPath]?.hash ?? '';
        if (hash) {
          try {
            fs.writeFileSync(`${cachePath}.meta`, hash, 'utf-8');
          } catch {
            /* ignore */
          }
        }
        finishDownload(logicalPath, true);
        return;
      } catch (err) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        console.warn('[AssetLoader] download failed', logicalPath, err);
        finishDownload(logicalPath, false);
        return;
      } finally {
        releaseDownloadSlot();
      }
    }
  })();
}

export async function resolveOrDownload(logicalPath: string): Promise<string> {
  const resolved = resolveAsset(logicalPath);
  if (resolved) return resolved;
  if (!isCdnPath(logicalPath)) return logicalPath;
  return new Promise((resolve) => {
    downloadAndNotify(logicalPath, (ok) => {
      resolve(resolveAsset(logicalPath) ?? logicalPath);
      if (!ok) console.warn('[AssetLoader] fallback to logical path', logicalPath);
    });
  });
}

/** 删掉某条 CDN 本地缓存，下次 resolveOrDownload 会重新拉。图集升级后旧 idle 图还占着同名路径时用。 */
export function invalidateCache(logicalPath: string): void {
  runtimeTempUrlCache.delete(logicalPath);
  if (!CACHE_ROOT) return;
  const cachePath = getCachePath(logicalPath);
  localExistsCache.delete(cachePath);
  if (!fs) return;
  try {
    fs.unlinkSync(cachePath);
  } catch {
    /* 没有缓存文件就算了 */
  }
  try {
    fs.unlinkSync(`${cachePath}.meta`);
  } catch {
    /* ignore */
  }
}

export function prefetchManifest(): Promise<void> {
  if (manifestReady) return Promise.resolve();
  if (!CDN_PUBLIC_BASE_URL) {
    manifestReady = true;
    return Promise.resolve();
  }

  const url = `${CDN_PUBLIC_BASE_URL}/${CDN_FILE_PREFIX}/manifest.json?t=${Date.now()}`;
  return new Promise((resolve) => {
    request({
      url,
      method: 'GET',
      success: (res) => {
        try {
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          manifest = (data ?? null) as CdnManifest | null;
        } catch (e) {
          console.warn('[AssetLoader] manifest parse failed', e);
        }
        manifestReady = true;
        resolve();
      },
      fail: (err) => {
        console.warn('[AssetLoader] manifest fetch failed (CDN 资源仍可按路径下载)', err);
        manifestReady = true;
        resolve();
      },
    });
  });
}

export const AssetLoader = {
  isCdnPath,
  getCdnUrl,
  resolveAsset,
  resolveOrDownload,
  downloadAndNotify,
  invalidateCache,
  prefetchManifest,
};
