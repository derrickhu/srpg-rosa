import { setShowcaseFontFamily, showcaseFontFamily } from '@/theme/typography';

/**
 * 只加载**展示字体**（得意黑）。正文走系统 sans-serif，不打包、不 loadFont。
 *
 * 微信：`wx.loadFont` → TrueType；失败则展示角色也回退系统字，不卡死进游戏。
 */

declare const wx: {
  loadFont?: (path: string) => string;
} | undefined;

/** 子集产物；源文件在 tools/font-src/SmileySans-Oblique.ttf */
const SHOWCASE_PATH = 'fonts/SmileySans-subset.ttf';
const LOGICAL_FAMILY = 'SmileySans';

let loaded = false;

function formatErr(e: unknown): string {
  if (e == null) return String(e);
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  if (typeof e === 'object') {
    const o = e as { errMsg?: unknown; message?: unknown };
    if (o.errMsg != null) return String(o.errMsg);
    if (o.message != null) return String(o.message);
    try {
      return JSON.stringify(e);
    } catch {
      return Object.prototype.toString.call(e);
    }
  }
  return String(e);
}

function isWechatMinigame(): boolean {
  return typeof wx !== 'undefined' && typeof wx.loadFont === 'function';
}

async function loadH5(url: string): Promise<string> {
  if (typeof FontFace === 'undefined' || !document?.fonts) {
    throw new Error('FontFace API unavailable');
  }
  const face = new FontFace(LOGICAL_FAMILY, `url(${url})`);
  await face.load();
  document.fonts.add(face);
  return LOGICAL_FAMILY;
}

function loadWx(path: string): string {
  let family: string;
  try {
    family = wx!.loadFont!(path);
  } catch (e) {
    throw new Error(`wx.loadFont 抛错 ${path}: ${formatErr(e)}`);
  }
  if (!family || typeof family !== 'string') {
    throw new Error(`wx.loadFont 未返回 family: ${path} → ${formatErr(family)}`);
  }
  if (/\s/.test(family) && !family.startsWith('"')) {
    family = `"${family}"`;
  }
  return family;
}

/** 与图片 bundle 并行调用；幂等 */
export async function loadGameFonts(): Promise<void> {
  if (loaded) return;

  try {
    const family = isWechatMinigame()
      ? loadWx(SHOWCASE_PATH)
      : await loadH5(`/${SHOWCASE_PATH}`);
    setShowcaseFontFamily(family);
    loaded = true;
    console.log(`[FontLoader] showcase ready → ${showcaseFontFamily()}`);
  } catch (e) {
    console.warn('[FontLoader] 展示字体加载失败，展示角色回退系统字:', formatErr(e));
    loaded = true;
  }
}

export function fontsReady(): boolean {
  return loaded;
}
