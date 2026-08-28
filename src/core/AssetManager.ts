import * as PIXI from 'pixi.js';

import { AssetLoader } from './AssetLoader';

/**
 * Centralised asset loader / cache.
 *
 * Uses wx.createImage() directly for WeChat mini-game compatibility,
 * bypassing PIXI.Assets which has URL resolution issues in the mini-game
 * environment (location.href is simulated as 'game.js').
 *
 * Paths are logical game paths (e.g. images/terrain/forest.png).
 * CDN 目录会先 resolveOrDownload，bundled 目录直接走本地包内路径。
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const wx: any;
declare const GameGlobal: any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface AssetBundleDef {
  name: string;
  assets: Record<string, string>;
}

const loadedBundles = new Set<string>();
const textureCache = new Map<string, PIXI.Texture>();

function bundleKey(bundle: string, name: string): string {
  return `${bundle}::${name}`;
}

/**
 * 单张图的解码上限。
 *
 * 微信的 `createImage()` 在个别路径下（缓存文件、瘦包后缺失的包内路径）**既不回 onload
 * 也不回 onerror**，Promise 就永远挂着：整个 `Promise.all` 卡死，控制台一条错都没有。
 * 所以这里必须自己兜一个超时，超了就退白图，让 Loading 能往下走。
 */
const IMAGE_DECODE_TIMEOUT_MS = 8000;

function loadImageAsTexture(src: string): Promise<PIXI.Texture> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (tex: PIXI.Texture): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(tex);
    };
    const timer = setTimeout(() => {
      console.warn(`[AssetManager] image decode timeout ${IMAGE_DECODE_TIMEOUT_MS}ms: ${src}`);
      finish(PIXI.Texture.WHITE);
    }, IMAGE_DECODE_TIMEOUT_MS);

    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const g = typeof GameGlobal !== 'undefined' ? (GameGlobal as any) : undefined;
      const wxApi: any = typeof wx !== 'undefined' ? wx : g?.wx;
      /* eslint-enable @typescript-eslint/no-explicit-any */

      if (wxApi?.createImage) {
        const img = wxApi.createImage();
        img.onload = () => {
          try {
            const base = PIXI.BaseTexture.from(img);
            finish(new PIXI.Texture(base));
          } catch {
            console.warn(`[AssetManager] BaseTexture.from failed for ${src}`);
            finish(PIXI.Texture.WHITE);
          }
        };
        img.onerror = (err: unknown) => {
          console.warn(`[AssetManager] wx image load failed: ${src}`, err);
          finish(PIXI.Texture.WHITE);
        };
        img.src = src;
      } else {
        PIXI.Assets.load<PIXI.Texture>(src)
          .then((tex) => finish(tex))
          .catch(() => {
            console.warn(`[AssetManager] PIXI.Assets fallback failed: ${src}`);
            finish(PIXI.Texture.WHITE);
          });
      }
    } catch {
      console.warn(`[AssetManager] Unexpected error loading ${src}`);
      finish(PIXI.Texture.WHITE);
    }
  });
}

export const AssetManager = {
  /**
   * 加载单张图并写入指定 bundle 缓存。Loading 首屏用它先拉 Logo，
   * 不会把整个 `ui` bundle 标成已加载。
   */
  async loadNamed(bundle: string, name: string, logicalPath: string): Promise<PIXI.Texture> {
    const key = bundleKey(bundle, name);
    const hit = textureCache.get(key);
    if (hit && hit !== PIXI.Texture.WHITE) return hit;
    const src = await AssetLoader.resolveOrDownload(logicalPath);
    const tex = await loadImageAsTexture(src);
    textureCache.set(key, tex);
    return tex;
  },

  async loadBundle(
    def: AssetBundleDef,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<void> {
    const assets = def?.assets || {};
    const total = Object.keys(assets).length;
    const entries = Object.entries(assets).filter(
      ([key]) => !textureCache.has(bundleKey(def.name, key)),
    );
    if (entries.length === 0) {
      loadedBundles.add(def.name);
      onProgress?.(total, total);
      return;
    }
    let done = total - entries.length;
    const loaded = await Promise.all(
      entries.map(async ([key, logicalPath]) => {
        const src = await AssetLoader.resolveOrDownload(logicalPath);
        const tex = await loadImageAsTexture(src);
        done += 1;
        onProgress?.(done, total);
        return [key, tex] as const;
      }),
    );
    for (const [key, tex] of loaded) {
      textureCache.set(bundleKey(def.name, key), tex);
    }
    loadedBundles.add(def.name);
    console.log(`[AssetManager] Bundle '${def.name}' loaded (${entries.length} assets)`);
  },

  texture(bundle: string, name: string): PIXI.Texture {
    return textureCache.get(bundleKey(bundle, name)) ?? PIXI.Texture.WHITE;
  },

  isBundleLoaded(bundleName: string): boolean {
    return loadedBundles.has(bundleName);
  },

  evict(bundle: string, name: string): void {
    const key = bundleKey(bundle, name);
    const tex = textureCache.get(key);
    if (tex) {
      if (tex !== PIXI.Texture.WHITE) tex.destroy(true);
      textureCache.delete(key);
    }
    const prefix = `${bundle}::`;
    for (const k of textureCache.keys()) {
      if (k.startsWith(prefix)) return;
    }
    loadedBundles.delete(bundle);
  },

  unloadBundle(bundleName: string): void {
    const prefix = `${bundleName}::`;
    for (const [k, tex] of textureCache) {
      if (k.startsWith(prefix)) {
        tex.destroy(true);
        textureCache.delete(k);
      }
    }
    loadedBundles.delete(bundleName);
  },

  reset(): void {
    for (const tex of textureCache.values()) {
      tex.destroy(true);
    }
    textureCache.clear();
    loadedBundles.clear();
  },
};
