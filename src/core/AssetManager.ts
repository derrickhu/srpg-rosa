import * as PIXI from 'pixi.js';

import { AssetLoader } from './AssetLoader';

/**
 * Centralised asset loader / cache.
 *
 * Uses wx.createImage() directly for WeChat mini-game compatibility,
 * bypassing PIXI.Assets which has URL resolution issues in the mini-game
 * environment (location.href is simulated as 'game.js').
 *
 * Paths are logical game paths (e.g. images/terrain/plain.png).
 * CDN 目录会先 resolveOrDownload，bundled 目录直接走本地包内路径。
 */

export interface AssetBundleDef {
  name: string;
  assets: Record<string, string>;
}

const loadedBundles = new Set<string>();
const textureCache = new Map<string, PIXI.Texture>();

function bundleKey(bundle: string, name: string): string {
  return `${bundle}::${name}`;
}

function loadImageAsTexture(src: string): Promise<PIXI.Texture> {
  return new Promise((resolve) => {
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
            resolve(new PIXI.Texture(base));
          } catch {
            console.warn(`[AssetManager] BaseTexture.from failed for ${src}`);
            resolve(PIXI.Texture.WHITE);
          }
        };
        img.onerror = (err: unknown) => {
          console.warn(`[AssetManager] wx image load failed: ${src}`, err);
          resolve(PIXI.Texture.WHITE);
        };
        img.src = src;
      } else {
        PIXI.Assets.load<PIXI.Texture>(src)
          .then((tex) => resolve(tex))
          .catch(() => {
            console.warn(`[AssetManager] PIXI.Assets fallback failed: ${src}`);
            resolve(PIXI.Texture.WHITE);
          });
      }
    } catch {
      console.warn(`[AssetManager] Unexpected error loading ${src}`);
      resolve(PIXI.Texture.WHITE);
    }
  });
}

export const AssetManager = {
  async loadBundle(def: AssetBundleDef): Promise<void> {
    if (loadedBundles.has(def.name)) return;
    const entries = Object.entries(def.assets);
    const loaded = await Promise.all(
      entries.map(async ([key, logicalPath]) => {
        const src = await AssetLoader.resolveOrDownload(logicalPath);
        const tex = await loadImageAsTexture(src);
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
