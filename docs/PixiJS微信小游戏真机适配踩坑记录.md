# PixiJS 微信小游戏真机适配踩坑记录

> **说明**：本文档自同工作区项目 `game2D_huahua` 原样拷贝，与 `srpg-rosa` 共用 Pixi 7.3 + `minigame/pixi-adapter` + `src/core/pixiUnsafeEvalPatch.ts` 等思路，供本仓库对照排查。

> **PixiJS 版本**: v7.3.2  
> **基础库版本**: 3.12.1 ~ 3.14.3  
> **测试设备**: iPhone 13 Pro Max (iOS)、华为鸿蒙  
> **构建工具**: Vite (IIFE 格式输出)  
> **记录时间**: 2026-03

---

## 目录

1. [全局变量挂载：GameGlobal ≠ 全局作用域](#1-全局变量挂载gameglobal--全局作用域)
2. [定时器 polyfill：setTimeout 在真机 bundle 中不可用](#2-定时器-polyfillsettimeout-在真机-bundle-中不可用)
3. [canvas 只读属性：模拟器中 window.canvas 不可写](#3-canvas-只读属性模拟器中-windowcanvas-不可写)
4. [Object.defineProperty TypeError](#4-objectdefineproperty-typeerror)
5. [PIXI.settings.ADAPTER 配置](#5-pixisettingsadapter-配置)
6. [createOffscreenCanvas 兼容性](#6-createoffscreencanvas-兼容性)
7. [Texture.WHITE 重建](#7-texturewhite-重建)
8. [Canvas 纹理上传（Text/Graphics 不渲染）](#8-canvas-纹理上传textgraphics-不渲染)
9. [upload 无限递归](#9-upload-无限递归)
10. [EventSystem 坐标映射（触摸无反应）](#10-eventsystem-坐标映射触摸无反应)
11. [触摸事件桥接](#11-触摸事件桥接)
12. [unsafe-eval patch](#12-unsafe-eval-patch)

---

## 1. 全局变量挂载：GameGlobal ≠ 全局作用域

### 现象

真机上 PixiJS 初始化报错 `Can't find variable: document` 或 `Can't find variable: setTimeout`，模拟器正常。

### 原因

微信小游戏提供 `GameGlobal` 作为跨文件共享对象，但它**不是 JavaScript 引擎的全局作用域**。Vite 打包输出 IIFE 格式，bundle 内部的自由变量（`document`、`window`、`setTimeout` 等）在运行时从 JS 引擎的**真正全局对象**上查找，而不是从 `GameGlobal` 上查找。

模拟器环境下 `GameGlobal` 恰好是 `window`（浏览器环境），所以挂到 `GameGlobal` 上就能访问。真机环境中 `GameGlobal` 只是一个普通对象。

### 解决方案

```javascript
// 获取真正的 JS 全局对象
const _realGlobal = (typeof globalThis !== 'undefined' && globalThis)
  || (typeof global !== 'undefined' && global)
  || GameGlobal;

// 真机：必须挂到 _realGlobal 上
_realGlobal.document = document;
_realGlobal.window = _realGlobal;
_realGlobal.navigator = navigator;
// ... 其他 polyfill
```

### 要点

- 模拟器用 `defineProperty` 补充已有的 `window` 对象
- 真机用直接赋值挂到 `_realGlobal`（`globalThis` / `global`）
- 同时挂到 `GameGlobal` 保证跨文件也能访问

---

## 2. 定时器 polyfill：setTimeout 在真机 bundle 中不可用

### 现象

真机报 `Can't find variable: setTimeout`，但 adapter 模块内部能正常调用 `setTimeout`。

### 原因

微信小游戏框架在每个 JS 文件的模块作用域中注入了 `setTimeout` 等 API，但没有挂到全局对象上。adapter 模块内部能用是因为它在模块作用域中；IIFE bundle 内部找不到是因为 bundle 的自由变量走全局查找。

### 解决方案

在 adapter 中把定时器 API 从模块作用域"搬"到全局对象：

```javascript
;(function _patchTimers() {
  var pairs = {};
  if (typeof setTimeout !== 'undefined')           pairs.setTimeout = setTimeout;
  if (typeof setInterval !== 'undefined')           pairs.setInterval = setInterval;
  if (typeof requestAnimationFrame !== 'undefined') pairs.requestAnimationFrame = requestAnimationFrame;
  // ... clearTimeout, clearInterval, cancelAnimationFrame
  for (var k in pairs) {
    if (typeof _realGlobal[k] === 'undefined') _realGlobal[k] = pairs[k];
    if (typeof GameGlobal[k] === 'undefined')  GameGlobal[k] = pairs[k];
  }
})();
```

### 附加建议

游戏代码中尽量避免直接使用 `setInterval`，改用 PixiJS Ticker 或自定义 TweenManager 驱动动画，减少对原生定时器的依赖。

---

## 3. canvas 只读属性：模拟器中 window.canvas 不可写

### 现象

模拟器报 `TypeError: Cannot assign to read only property 'canvas' of object '#<Window>'`。

### 原因

微信开发者工具的模拟器环境中，`window.canvas` 被框架设为只读属性（通过不可配置的 getter）。直接赋值会抛 TypeError。

### 解决方案

用 `try-catch` 保护赋值：

```javascript
try { GameGlobal.canvas = canvas; } catch (e) { /* 已由框架设置 */ }
try { _realGlobal.canvas = canvas; } catch (e) { /* 只读属性忽略 */ }
```

---

## 4. Object.defineProperty TypeError

### 现象

PixiJS 内部大量使用 `Object.defineProperty`，在真机环境中遇到不可配置的属性时抛 TypeError 导致初始化中断。

### 解决方案

全局 patch `Object.defineProperty`，将 TypeError 静默处理：

```javascript
const _origDefineProperty = Object.defineProperty;
Object.defineProperty = function safeDefineProperty(obj, prop, descriptor) {
  try {
    return _origDefineProperty.call(Object, obj, prop, descriptor);
  } catch (e) {
    if (e instanceof TypeError) return obj;
    throw e;
  }
};
```

同理 patch `Object.defineProperties`。

### 注意事项

- 此 patch 应在所有其他代码之前执行（adapter 入口顶部）
- 只吞 `TypeError`，其他异常正常抛出

---

## 5. PIXI.settings.ADAPTER 配置

### 现象

真机上 `PIXI.Graphics` 和 `PIXI.Text` 完全不渲染，只有 `PIXI.Sprite`（图片）正常。

### 原因

PixiJS 的 `BrowserAdapter` 默认通过 `document.createElement('canvas')` 创建离屏 canvas。虽然 adapter 模拟了 `document.createElement`，但真机上返回的对象可能不完整，导致 PixiJS 内部创建的离屏 canvas 2D 上下文异常。

### 解决方案

在 `new PIXI.Application()` **之前**显式配置 `PIXI.settings.ADAPTER`：

```typescript
import { settings } from '@pixi/settings';

const _api = typeof wx !== 'undefined' ? wx : tt;

settings.ADAPTER = {
  createCanvas: (width?: number, height?: number) => {
    const c = _api.createCanvas();
    if (width !== undefined) c.width = width;
    if (height !== undefined) c.height = height;
    return c;
  },
  getCanvasRenderingContext2D: () => {
    const c = _api.createCanvas();
    const ctx = c.getContext('2d');
    return ctx ? ctx.constructor : Object;
  },
  getWebGLRenderingContext: () => {
    const c = _api.createCanvas();
    const gl = c.getContext('webgl');
    return gl ? gl.constructor : Object;
  },
  getNavigator: () => ({ userAgent: 'wxgame', gpu: null }),
  getBaseUrl: () => '',
  getFontFaceSet: () => null,
  fetch: () => Promise.reject(new Error('fetch not available')),
};
```

### 要点

- 必须在 `new PIXI.Application()` 之前执行
- `createCanvas` 直接调用 `wx.createCanvas()` 而不是 `document.createElement`

---

## 6. createOffscreenCanvas 兼容性

### 现象

`wx.createOffscreenCanvas({ type: '2d' })` 在部分设备上不可用（如华为鸿蒙、旧版微信），直接调用会导致白屏崩溃。

### 解决方案

启动时检测，不可用则降级：

```typescript
let _useOffscreen = false;
try {
  if (typeof _api.createOffscreenCanvas === 'function') {
    const _test = _api.createOffscreenCanvas({ type: '2d', width: 1, height: 1 });
    const _testCtx = _test.getContext('2d');
    if (_testCtx) _useOffscreen = true;
  }
} catch (_) { /* 不支持则回退 */ }

const _create2DCanvas = (w, h) => {
  if (_useOffscreen) {
    try { return _api.createOffscreenCanvas({ type: '2d', width: w || 1, height: h || 1 }); }
    catch (_) { /* fallthrough */ }
  }
  return _api.createCanvas();
};
```

### 实测结果

| 设备 | createOffscreenCanvas | createCanvas 2D |
|------|----------------------|-----------------|
| iPhone 13 Pro Max | ❌ 不可用 | ✅ 2D 正常 |
| 微信开发者工具 | ❌ 不可用 | ✅ 2D 正常 |
| 华为鸿蒙 | ❌ 不可用 | 需测试 |

---

## 7. Texture.WHITE 重建

### 现象

真机上所有 `PIXI.Graphics` 的填充色渲染为**全黑**。

### 原因

`PIXI.Graphics` 的填充使用 `Texture.WHITE` 作为纹理源。PixiJS 默认用 Canvas 2D 创建一个 16x16 白色 canvas 作为 `Texture.WHITE`。在真机上 `gl.texImage2D(canvas)` 静默失败（上传空白像素），导致 `Texture.WHITE` 实际为全黑。

### 解决方案

用纯像素 buffer 直接创建，完全绕过 Canvas：

```typescript
import { Texture, BaseTexture } from '@pixi/core';

const whitePixels = new Uint8Array(16 * 16 * 4);
whitePixels.fill(255); // 全白 RGBA

const whiteBT = BaseTexture.fromBuffer(whitePixels, 16, 16);
const whiteTex = new Texture(whiteBT);
(whiteTex as any).destroy = () => {}; // 防止被意外销毁

// WHITE 是 getter 只读属性，必须用 defineProperty 覆盖
Object.defineProperty(Texture, '_WHITE', {
  value: whiteTex, writable: true, configurable: true
});
Object.defineProperty(Texture, 'WHITE', {
  get: () => whiteTex, configurable: true
});
```

### 注意

- `Texture.WHITE` 在 PixiJS 7 中是 static getter，不能直接赋值
- 用 `Object.defineProperty` 覆盖 getter
- 仅在真机上执行此 patch（模拟器上原始 WHITE 正常工作）

---

## 8. Canvas 纹理上传（Text/Graphics 不渲染）

### 现象

真机上 `PIXI.Text` 不显示文字，`PIXI.Graphics` 自绘图形颜色异常或不显示。Sprite（图片纹理）正常。

### 原因

真机上 `gl.texImage2D(gl.TEXTURE_2D, ..., canvasElement)` **静默失败**——不报错，但上传的是空白/黑色像素。相关 API 情况：

| API | 真机表现 |
|-----|---------|
| `gl.texImage2D(canvas)` | ❌ 静默失败（空白像素） |
| `gl.texImage2D(imageElement)` | ✅ 正常 |
| `gl.texImage2D(w, h, 0, format, type, Uint8Array)` | ✅ 正常 |
| `ctx.getImageData()` | ✅ 返回正确像素（在 createCanvas 的 canvas 上） |
| `canvas.toDataURL()` | ❌ 返回全黑图片 |
| `canvas.toTempFilePathSync()` | ✅ 可用但可能生成空白图片 |

### 解决方案

拦截 `BaseImageResource.prototype.upload`，对 Canvas 源用 `getImageData → Uint8Array buffer → gl.texImage2D` 同步覆盖：

```typescript
const _origUpload = BaseImageResource.prototype.upload;
let _inUpload = false;

BaseImageResource.prototype.upload = function(renderer, baseTexture, glTexture, source) {
  // 重入保护
  if (_inUpload) return _origUpload.call(this, renderer, baseTexture, glTexture, source);
  _inUpload = true;

  try {
    source = source || this.source;

    // 1) 永远先执行原始 upload（Image 纹理靠这步正常工作）
    const result = _origUpload.call(this, renderer, baseTexture, glTexture, source);

    // 2) 仅对 Canvas 源做像素补救
    // 用 toTempFilePathSync 存在性区分 Canvas 和 Image
    if (source
        && source.width > 0 && source.height > 0
        && typeof source.getContext === 'function'
        && typeof source.toTempFilePathSync === 'function') {
      const ctx = source.getContext('2d');
      if (ctx && typeof ctx.getImageData === 'function') {
        const w = source.width, h = source.height;
        const imageData = ctx.getImageData(0, 0, w, h);
        const pixels = new Uint8Array(imageData.data.buffer);
        const gl = renderer.gl;
        // 原始 upload 已绑定纹理，直接覆盖像素
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
          baseTexture.alphaMode > 0 ? 1 : 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, glTexture.internalFormat,
          w, h, 0, baseTexture.format, glTexture.type, pixels);
      }
    }

    return result;
  } finally {
    _inUpload = false;
  }
};
```

### 关键细节

- **Canvas vs Image 判断**：用 `typeof source.toTempFilePathSync === 'function'`，只有微信 Canvas 对象有此方法，Image 没有
- **format 参数**：必须用 `baseTexture.format`（不是 `glTexture.format`），和 PixiJS 原始代码保持一致
- **不调用 `renderer.texture.bind()`**：原始 upload 已绑定纹理，重复绑定会触发递归（见第 9 条）

---

## 9. upload 无限递归

### 现象

真机白屏卡死，内存飙升到 900MB+，FPS:0，点击小程序退出按钮也卡死。

### 原因

在 `BaseImageResource.prototype.upload` 内部调用了 `renderer.texture.bind(baseTexture, 0)`。PixiJS 的 `TextureSystem.bind()` 会检查纹理 `dirtyId`，如果发现纹理需要更新则调用 `updateTexture()`，进而再次调用 `upload()`，形成**无限递归**。

### 解决方案

1. **不在 upload 内部调用 `renderer.texture.bind()`** — 原始 upload 已经绑定了正确的纹理
2. **加重入保护**：

```typescript
let _inUpload = false;

BaseImageResource.prototype.upload = function(...) {
  if (_inUpload) return _origUpload.call(this, ...);
  _inUpload = true;
  try {
    // ... patch 逻辑 ...
  } finally {
    _inUpload = false;
  }
};
```

### 教训

> 在 PixiJS 的资源上传回调中，永远不要触发纹理系统的 bind/update 操作。直接操作底层 GL 对象。

---

## 10. EventSystem 坐标映射（触摸无反应）

### 现象

真机上触摸事件到达了 canvas（有 `[Touch] down` 日志），PixiJS EventSystem 也注册了监听器（有 `pointerdown` 等），但游戏内所有交互元素（按钮、拖拽）**完全无反应**。

### 原因

PixiJS 7 的 `EventSystem.mapPositionToPoint()` 内部逻辑：

```javascript
mapPositionToPoint(point, x, y) {
  let rect;
  if (!this.domElement.parentElement) {
    // 真机走到这里：parentElement 为 null
    rect = { x: 0, y: 0, width: 0, height: 0 };
  } else {
    rect = this.domElement.getBoundingClientRect();
  }
  // rect.width = 0 → 坐标计算除以 0 → NaN → hit test 全部失败
}
```

真机上 `canvas.parentElement` 不可写（WeChat 框架限制），即使在 adapter 中尝试设置也可能失败，导致为 `null`。

### 解决方案

在 `Game.init()` 后直接覆盖 `mapPositionToPoint`：

```typescript
const evtSys = (this.app.renderer as any).events;
if (evtSys && evtSys.domElement) {
  const dom = evtSys.domElement;
  evtSys.mapPositionToPoint = (point: any, x: number, y: number) => {
    let rect: any;
    try { rect = dom.getBoundingClientRect(); } catch (_) { rect = null; }
    if (!rect || !rect.width || !rect.height) {
      // 兜底：使用屏幕逻辑尺寸
      rect = { left: 0, top: 0, width: screenWidth, height: screenHeight };
    }
    const resMul = 1.0 / (evtSys.resolution || 1);
    point.x = ((x - (rect.left || 0)) * (dom.width / rect.width)) * resMul;
    point.y = ((y - (rect.top || 0)) * (dom.height / rect.height)) * resMul;
  };
}
```

### 诊断技巧

在 adapter 的 `TouchEvent.js` 中加日志确认事件链：

```javascript
platform.onTouchStart((e) => {
  console.log('[Touch] down, x:', e.touches[0].clientX, 'y:', e.touches[0].clientY);
  // ...
});
```

在 BoardView 的 `pointerdown` 中加日志确认 PixiJS 是否收到事件。如果 Touch 有日志但 BoardView 没有，说明坐标映射有问题。

---

## 11. 触摸事件桥接

### 现象

PixiJS 7 的事件系统不响应触摸，即使已注册 `touchstart`/`touchend`。

### 原因

PixiJS 7 优先使用 **Pointer Events**（`pointerdown`/`pointermove`/`pointerup`），不再默认使用 Touch Events。微信小游戏只提供 `wx.onTouchStart` 等 API，需要手动转换为 Pointer Events。

### 解决方案

在 adapter 的 TouchEvent 模块中同时分发 touch 和 pointer 事件：

```javascript
platform.onTouchStart((e) => {
  dispatch('touchstart', e);        // Touch Event → canvas listeners
  dispatchPointer('pointerdown', e); // Pointer Event → canvas listeners
  dispatchToWindow('pointerdown', e); // Pointer Event → window listeners
});
```

### 要点

- PixiJS EventSystem 在 **canvas** 上监听 `pointerdown`、`pointerover`、`pointerleave`、`wheel`
- 在 **window** 上监听 `pointermove`、`pointerup`（用于拖拽出 canvas 的场景）
- 需要在 adapter 中实现 `window.addEventListener`/`removeEventListener` 并转发
- `getBoundingClientRect` 必须返回**逻辑像素**尺寸（和 `clientX`/`clientY` 一致）

---

## 12. unsafe-eval patch

### 现象

PixiJS 初始化报错：`eval is not allowed` 或 `new Function is not allowed`。

### 原因

微信小游戏环境禁止 `eval` 和 `new Function`。PixiJS 7 的 `ShaderSystem` 使用 `new Function` 动态生成 uniform 同步代码。官方 `@pixi/unsafe-eval` 包是解决方案，但在小游戏环境中可能无法正常 import。

### 解决方案

内联实现 uniform 同步逻辑，直接 patch `ShaderSystem.prototype`：

```typescript
import { ShaderSystem } from '@pixi/core';

if (!(ShaderSystem.prototype as any).__patched) {
  Object.assign(ShaderSystem.prototype, {
    __patched: true,
    systemCheck() { /* 禁用 eval 检测 */ },
    syncUniforms(group, glProgram) {
      // 手写的 uniform 同步逻辑，覆盖所有 GLSL 类型
      patchedSyncUniforms(group, ...);
    },
  });
}
```

### 要点

- 必须在 `new PIXI.Application()` 之前执行
- 需要覆盖所有 GLSL uniform 类型（`float`、`vec2`、`vec3`、`vec4`、`mat3`、`mat4`、`sampler2D` 等）
- 用 `__patched` 标志防止重复 patch

---

## 诊断方法论

### 1. 分层诊断

真机问题的调试思路：**adapter 层 → PixiJS 初始化层 → 渲染层 → 交互层**

```
wx.onTouchStart → adapter TouchEvent → canvas.addEventListener
  → PixiJS EventSystem → mapPositionToPoint → hit test → 游戏逻辑

wx.createCanvas → adapter canvas → PIXI.settings.ADAPTER.createCanvas
  → PIXI.Text canvas → 2D draw → gl.texImage2D → 屏幕像素
```

### 2. 关键诊断点

```javascript
// adapter 初始化
console.log('_realGlobal === GameGlobal:', _realGlobal === GameGlobal);
console.log('typeof document:', typeof document, 'typeof window:', typeof window);

// Canvas 2D 能力
const c = wx.createCanvas(); c.width = 4; c.height = 4;
const ctx = c.getContext('2d');
ctx.fillStyle = '#FF0000'; ctx.fillRect(0, 0, 4, 4);
const px = ctx.getImageData(0, 0, 1, 1).data;
console.log('pixel:', px[0], px[1], px[2], px[3]); // 应为 255, 0, 0, 255

// 平台信息
const info = wx.getSystemInfoSync();
console.log('platform:', info.platform, 'brand:', info.brand, 'model:', info.model);
// platform !== 'devtools' → 真机
```

### 3. 真机/模拟器差异速查

| 特性 | 模拟器 | 真机 |
|------|--------|------|
| `GameGlobal === window` | ✅ 是 | ❌ 否 |
| `document.createElement` | ✅ 原生 | ⚠️ polyfill |
| `setTimeout` 全局可用 | ✅ 是 | ❌ 需 polyfill |
| `gl.texImage2D(canvas)` | ✅ 正常 | ❌ 静默失败 |
| `canvas.getImageData` | ✅ 正常 | ✅ 正常（createCanvas） |
| `canvas.toDataURL` | ✅ 正常 | ❌ 返回全黑 |
| `canvas.parentElement` 可写 | ⚠️ 可能只读 | ❌ 不可写 |
| `createOffscreenCanvas` | ❌ 不可用 | ❌ 大部分不可用 |
| `Object.defineProperty` | ✅ 正常 | ⚠️ 部分属性抛错 |

---

## 总结：最小可行 patch 清单

按执行顺序：

1. **adapter/index.js**：`Object.defineProperty` 安全 patch → 全局变量挂载 → 定时器 polyfill → canvas 只读保护 → 触摸事件桥接
2. **pixiUnsafeEvalPatch.ts**：`settings.ADAPTER` 配置 → `ShaderSystem` unsafe-eval patch → `Texture.WHITE` fromBuffer 重建 → `BaseImageResource.upload` canvas buffer 覆盖
3. **Game.ts**：`EventSystem.mapPositionToPoint` 坐标映射修复

## 11. 上传/真机调试报 `Unknown Error Message [object Object]`

开发者工具 **2.02** 系列常把真实失败掩成这句。本仓库曾经只 ignore 了 CDN 图目录，
结果 `tools/`（~700MB）、`godot/`、`art/`、三份 `wechat-godot*` 都会打进包，上传必炸。

**处理**：`project.config.json` → `packOptions.ignore` 排除所有非运行时目录；主包应只剩
`game.js` / `minigame/` / `images/ui/` / `fonts/` / `audio/`，合计约 2MB（&lt; 4MB 上限）。
改完后在开发者工具里重新编译再预览/上传。

## 12. 自定义展示字体（得意黑）

- 只给标题/按钮/技能气泡 load：`wx.loadFont('fonts/SmileySans-subset.ttf')`。正文系统字。
- **不要用 CFF/OTF**；family 含空格时加双引号（加载器已处理）。
- 规范：`docs/字体规范.md`。随主包 `fonts/`，勿放 CDN。
- 控制台应见 `[FontLoader] showcase ready → ...`；没有则展示角色也在用系统字。
