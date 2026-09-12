import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const ADAPTER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 仓库是 `"type": "module"`，但微信按 CommonJS 跑 adapter。
 * 这里用最小 CJS 加载器还原真机的加载方式。
 */
function loadAdapter(sandbox: Record<string, unknown>): void {
  const context = vm.createContext(sandbox);
  const cache = new Map<string, Record<string, unknown>>();

  const load = (file: string): Record<string, unknown> => {
    const full = require.resolve ? file : file;
    const cached = cache.get(full);
    if (cached) return cached;
    const module = { exports: {} as Record<string, unknown> };
    cache.set(full, module.exports);
    const src = fs.readFileSync(full, 'utf8');
    const fn = vm.runInContext(
      `(function (exports, require, module, __filename, __dirname) {${src}\n})`,
      context,
      { filename: full },
    );
    const localRequire = (spec: string) => {
      const target = path.resolve(path.dirname(full), spec);
      return load(fs.existsSync(target) ? target : `${target}.js`);
    };
    fn(module.exports, localRequire, module, full, path.dirname(full));
    cache.set(full, module.exports);
    return module.exports;
  };

  load(path.join(ADAPTER_DIR, 'index.js'));
}

/**
 * iOS 微信的原生 WebGL 上下文写任何字段都抛 TypeError。
 * 用代理模拟，`Object.freeze` 在非严格模式下只是静默失败，钉不住这个坑。
 */
function makeReadonlyGl(): Record<string, unknown> {
  const target = {
    getContextAttributes: () => ({ stencil: 1, antialias: 1 }),
    getExtension: () => null,
  };
  return new Proxy(target, {
    set() {
      throw new TypeError('Attempted to assign to readonly property.');
    },
    defineProperty() {
      throw new TypeError('Attempted to assign to readonly property.');
    },
  });
}

function makeSandbox(gl: Record<string, unknown>, platform: string, brand: string) {
  const canvas: Record<string, unknown> = {
    width: 0,
    height: 0,
    getContext: (type: string) => (type === '2d' ? null : gl),
  };
  const wx = {
    createCanvas: () => canvas,
    createImage: () => ({ src: '', onload: null, onerror: null }),
    getSystemInfoSync: () => ({
      platform,
      brand,
      model: 'test',
      screenWidth: 393,
      screenHeight: 852,
      pixelRatio: 3,
    }),
    onTouchStart: () => {},
    onTouchMove: () => {},
    onTouchEnd: () => {},
    onTouchCancel: () => {},
  };
  const sandbox: Record<string, any> = {
    wx,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout,
    clearTimeout,
    Object,
    Array,
    Set,
    WeakSet,
    Proxy,
    Date,
    Math,
    JSON,
    TypeError,
    Error,
    String,
    Number,
    Boolean,
    Promise,
    performance,
  };
  sandbox.globalThis = sandbox;
  sandbox.GameGlobal = sandbox;
  return { sandbox, canvas };
}

describe('pixi-adapter 主屏 canvas.getContext', () => {
  it('iOS 原生 gl 只读时不外抛，仍然把上下文交给 Pixi', () => {
    const gl = makeReadonlyGl();
    const { sandbox, canvas } = makeSandbox(gl, 'ios', 'iPhone');
    loadAdapter(sandbox);

    expect(canvas.getContext).not.toBe(undefined);
    expect(() => (canvas.getContext as any)('webgl', { stencil: true })).not.toThrow();
    expect((canvas.getContext as any)('webgl', { stencil: true })).toBe(gl);
  });

  it('鸿蒙上补丁装不上也不外抛', () => {
    const gl = makeReadonlyGl();
    const { sandbox, canvas } = makeSandbox(gl, 'ohos', 'HUAWEI');
    loadAdapter(sandbox);

    expect(() => (canvas.getContext as any)('webgl', { stencil: true })).not.toThrow();
  });

  it('鸿蒙上 gl 可写时仍然把 0/1 收成布尔', () => {
    const gl: Record<string, unknown> = {
      getContextAttributes: () => ({ stencil: 1, antialias: 0, alpha: 1, depth: 1, preserveDrawingBuffer: 0 }),
      getExtension: () => null,
    };
    const { sandbox, canvas } = makeSandbox(gl, 'ohos', 'HUAWEI');
    loadAdapter(sandbox);

    const ctx = (canvas.getContext as any)('webgl', { stencil: true });
    const attrs = ctx.getContextAttributes();
    expect(attrs.stencil).toBe(true);
    expect(attrs.antialias).toBe(false);
  });
});
