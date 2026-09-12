/**
 * pixi-adapter 统一入口
 * 根据运行环境（真机/模拟器）将 DOM 模拟对象挂载到全局
 *
 * 关键：真机环境中 IIFE bundle 的自由变量（document、window 等）
 * 必须在 JS 引擎的全局作用域中可达，仅挂到 GameGlobal 不够——
 * GameGlobal 只是跨文件共享对象，不是全局作用域。
 * 因此真机需要挂到 globalThis / global 上。
 */

var platform, noop, Image, canvas, location, document, navigator, localStorage, XMLHttpRequest, registerTouchEvents;
var Element, HTMLCanvasElement, HTMLImageElement, HTMLVideoElement;

try { platform = require('./platform'); } catch (e) { console.error('[pixi-adapter] ✗ platform:', e); }
if (!platform) {
  platform = {
    getSystemInfoSync: function () { return {}; },
    createCanvas: function () { return { width: 0, height: 0, getContext: function () { return null; } }; },
    name: 'unknown',
  };
}
try { noop = require('./util').noop; } catch (e) { console.error('[pixi-adapter] ✗ util:', e); noop = function () {}; }
try { Image = require('./Image'); } catch (e) { console.error('[pixi-adapter] ✗ Image:', e); }
try { canvas = require('./canvas').canvas; } catch (e) { console.error('[pixi-adapter] ✗ canvas:', e); }
try { location = require('./location'); } catch (e) { console.error('[pixi-adapter] ✗ location:', e); location = {}; }
try { document = require('./document'); } catch (e) { console.error('[pixi-adapter] ✗ document:', e); }
try { navigator = require('./navigator'); } catch (e) { console.error('[pixi-adapter] ✗ navigator:', e); navigator = {}; }
try { localStorage = require('./localStorage'); } catch (e) { console.error('[pixi-adapter] ✗ localStorage:', e); localStorage = {}; }
try { XMLHttpRequest = require('./XMLHttpRequest'); } catch (e) { console.error('[pixi-adapter] ✗ XMLHttpRequest:', e); }
try { registerTouchEvents = require('./TouchEvent').registerTouchEvents; } catch (e) { console.error('[pixi-adapter] ✗ TouchEvent:', e); registerTouchEvents = function () {}; }
try {
  var _elem = require('./element');
  Element = _elem.Element;
  HTMLCanvasElement = _elem.HTMLCanvasElement;
  HTMLImageElement = _elem.HTMLImageElement;
  HTMLVideoElement = _elem.HTMLVideoElement;
} catch (e) {
  console.error('[pixi-adapter] ✗ element:', e);
  Element = function () {};
  HTMLCanvasElement = Element;
  HTMLImageElement = Element;
  HTMLVideoElement = Element;
}

// ======== 获取真正的 JS 全局对象 ========
// 优先 globalThis（ES2020+），其次 global（Node/V8），最后 GameGlobal
const _realGlobal = (typeof globalThis !== 'undefined' && globalThis)
  || (typeof global !== 'undefined' && global)
  || GameGlobal;

if (typeof _realGlobal.Intl === 'undefined') {
  _realGlobal.Intl = {};
}
if (typeof GameGlobal !== 'undefined' && typeof GameGlobal.Intl === 'undefined') {
  GameGlobal.Intl = _realGlobal.Intl;
}

// ======== Patch Object.defineProperty ========
const _origDefineProperty = Object.defineProperty;
try { GameGlobal.__origDefineProperty = _origDefineProperty; } catch (_) {}
Object.defineProperty = function safeDefineProperty(obj, prop, descriptor) {
  try {
    return _origDefineProperty.call(Object, obj, prop, descriptor);
  } catch (e) {
    if (e instanceof TypeError) return obj;
    throw e;
  }
};

const _origDefineProperties = Object.defineProperties;
Object.defineProperties = function safeDefineProperties(obj, props) {
  for (const key in props) {
    if (Object.prototype.hasOwnProperty.call(props, key)) {
      try {
        _origDefineProperty.call(Object, obj, key, props[key]);
      } catch (e) {
        if (!(e instanceof TypeError)) throw e;
      }
    }
  }
  return obj;
};

// ======== 获取系统信息 ========
const sysInfo = platform.getSystemInfoSync() || {};
const isDevtools = sysInfo.platform === 'devtools';
console.log('[pixi-adapter] sys', sysInfo.platform, sysInfo.brand, sysInfo.model);

// ======== 定时器 & 动画帧 polyfill ========
// 真机 IIFE bundle 可能无法以自由变量访问这些 API，
// 在 adapter 模块作用域中它们可用，挂到真正的全局对象。
;(function _patchTimers() {
  var pairs = {};
  if (typeof setTimeout !== 'undefined')              pairs.setTimeout = setTimeout;
  if (typeof clearTimeout !== 'undefined')             pairs.clearTimeout = clearTimeout;
  if (typeof setInterval !== 'undefined')              pairs.setInterval = setInterval;
  if (typeof clearInterval !== 'undefined')            pairs.clearInterval = clearInterval;
  if (typeof requestAnimationFrame !== 'undefined')    pairs.requestAnimationFrame = requestAnimationFrame;
  if (typeof cancelAnimationFrame !== 'undefined')     pairs.cancelAnimationFrame = cancelAnimationFrame;
  for (var k in pairs) {
    if (typeof _realGlobal[k] === 'undefined') _realGlobal[k] = pairs[k];
    if (typeof GameGlobal[k] === 'undefined')  GameGlobal[k] = pairs[k];
  }
})();

// ======== 禁用 OffscreenCanvas ========
if (typeof GameGlobal !== 'undefined') {
  GameGlobal.OffscreenCanvas = undefined;
  _realGlobal.OffscreenCanvas = undefined;
}

// 鸿蒙 contextAttributes 常回 0/1，假 VAO 扩展会把 Filter 弄死。
// 这两件事必须打在**正式** WebGL 上，不要为了拿 constructor 再 createCanvas+getContext：
// 微信第一次 createCanvas 才是主屏，后面每次再开一块；低端 Android 多开一块
// 带 antialias 的 WebGL，正式上下文经常建失败，表现就是打开失败 / 卡在微信开屏。
//
// 但补丁只许「尽力而为」：iOS 的原生 gl 是只读对象，往上写一个字段就 TypeError，
// 而这里是被 Pixi 在 new Application() 里调到的，抛出去就等于整个游戏起不来。
const _glPlatform = String(sysInfo.platform || '').toLowerCase();
const _glBrand = String(sysInfo.brand || '').toLowerCase();
const _needsGlQuirkPatch = _glPlatform === 'android' || _glPlatform === 'ohos'
  || _glPlatform === 'harmony' || _glPlatform === 'harmonyos'
  || _glBrand.indexOf('huawei') !== -1 || _glBrand.indexOf('honor') !== -1;

let _WebGLRenderingContext = Object;
const _patchedGl = typeof WeakSet === 'function' ? new WeakSet() : null;
// 装上去的 gl 方法，出事时要能一个个摘掉。
const _glUndo = [];

/** 往原生对象上装东西；只读就放弃，绝不外抛。 */
function _softAssign(obj, key, value) {
  try {
    obj[key] = value;
    return obj[key] === value;
  } catch (e) {
    return false;
  }
}

/** 装完记一笔，方便 __restoreNativeGetContext 回滚。 */
function _softAssignGl(gl, key, value) {
  let original;
  try { original = gl[key]; } catch (_) { original = undefined; }
  if (!_softAssign(gl, key, value)) return false;
  _glUndo.push({ gl, key, original });
  return true;
}

/**
 * 华为返回的 contextAttributes 是只读对象，直接写 attr.stencil 会抛。
 * 复制一份再把 0/1 收成布尔，原对象一个字段都不碰。
 */
function _booleanizeContextAttributes(attr) {
  const out = {};
  try {
    for (const k in attr) out[k] = attr[k];
  } catch (_) { /* 原生对象可能不可枚举 */ }
  out.stencil = !!attr.stencil;
  out.antialias = !!attr.antialias;
  out.alpha = !!attr.alpha;
  out.depth = !!attr.depth;
  out.preserveDrawingBuffer = !!attr.preserveDrawingBuffer;
  return out;
}

function _patchGlContext(gl) {
  if (!gl) return;
  // 重入标记只放在 WeakSet 里。写 gl.__srpgGlPatched 在 iOS 上会抛只读。
  try {
    if (_patchedGl) {
      if (_patchedGl.has(gl)) return;
      _patchedGl.add(gl);
    }
  } catch (_) { /* */ }

  if (!_WebGLRenderingContext || _WebGLRenderingContext === Object) {
    try { _WebGLRenderingContext = gl.constructor || Object; } catch (_) { /* */ }
    _softAssign(_realGlobal, 'WebGLRenderingContext', _WebGLRenderingContext);
    if (typeof GameGlobal !== 'undefined') {
      _softAssign(GameGlobal, 'WebGLRenderingContext', _WebGLRenderingContext);
    }
  }

  // 0/1 布尔化和假 VAO 都只是鸿蒙/安卓的毛病，iOS 不要碰原生上下文。
  if (!_needsGlQuirkPatch) return;

  try {
    const origGetCtxAttr = gl.getContextAttributes && gl.getContextAttributes.bind(gl);
    if (origGetCtxAttr) {
      _softAssignGl(gl, 'getContextAttributes', function () {
        const attr = origGetCtxAttr();
        if (!attr) return attr;
        // Pixi 在建 renderer 时就会调这里，抛出去等于整个游戏起不来。
        try {
          return _booleanizeContextAttributes(attr);
        } catch (e) {
          console.warn('[pixi-adapter] contextAttributes 布尔化失败，用原值:', e);
          return attr;
        }
      });
    }
  } catch (e3) {
    console.warn('[pixi-adapter] patch getContextAttributes 失败:', e3);
  }

  try {
    const vaoExt = gl.getExtension('OES_vertex_array_object');
    if (vaoExt && typeof vaoExt.createVertexArrayOES !== 'function') {
      const origGetExt = gl.getExtension.bind(gl);
      const ok = _softAssignGl(gl, 'getExtension', function (name) {
        if (name === 'OES_vertex_array_object') return null;
        return origGetExt(name);
      });
      console.warn('[pixi-adapter] OES_vertex_array_object 为假扩展，已禁用:', ok);
    }
  } catch (_) { /* 忽略 */ }
}

try {
  if (canvas && typeof canvas.getContext === 'function') {
    const origGetContext = canvas.getContext.bind(canvas);
    const wrappedGetContext = function (type, attrs) {
      const ctx = origGetContext(type, attrs);
      // 补丁失败绝不能影响拿上下文，否则 Pixi 整个建不起来。
      try {
        if (ctx && (type === 'webgl' || type === 'experimental-webgl' || type === 'webgl2')) {
          _patchGlContext(ctx);
        }
      } catch (e) {
        console.warn('[pixi-adapter] patch gl 上下文失败，已跳过:', e);
      }
      return ctx;
    };
    canvas.getContext = wrappedGetContext;
    // 万一还有别的只读点，让启动代码能一键卸掉所有兼容补丁再试一次。
    // getContext 会返回同一个 gl，所以装到 gl 上的方法也必须一起摘掉。
    if (typeof GameGlobal !== 'undefined') {
      GameGlobal.__restoreNativeGetContext = function () {
        let restored = false;
        try {
          if (canvas.getContext === wrappedGetContext) {
            canvas.getContext = origGetContext;
            restored = true;
          }
        } catch (e) { /* */ }
        while (_glUndo.length) {
          const undo = _glUndo.pop();
          try {
            undo.gl[undo.key] = undo.original;
            restored = true;
          } catch (e) { /* 摘不掉就算了 */ }
        }
        console.warn('[pixi-adapter] 已卸掉 gl 兼容补丁:', restored);
        return restored;
      };
    }
  }
} catch (e) {
  console.warn('[pixi-adapter] wrap canvas.getContext 失败:', e);
}

let _CanvasRenderingContext2D = Object;
try {
  const _tmpCanvas2 = platform.createCanvas();
  if (_tmpCanvas2 && typeof _tmpCanvas2.getContext === 'function') {
    const _tmpCtx = _tmpCanvas2.getContext('2d');
    if (_tmpCtx) _CanvasRenderingContext2D = _tmpCtx.constructor || Object;
  }
} catch (e) {
  console.warn('[pixi-adapter] Canvas2D 初始化异常:', e);
}

// ======== DOMParser ========
class DOMParser {
  parseFromString() {
    return { documentElement: new Element() };
  }
}

// ======== performance ========
const _performance = typeof performance !== 'undefined' ? performance : {
  now: Date.now.bind(Date),
};

// ======== window 事件系统 ========
const _windowListeners = {};
var _winEvtLogCount = 0;
function _windowAddEventListener(type, handler, options) {
  if (!_windowListeners[type]) _windowListeners[type] = [];
  _windowListeners[type].push(handler);
  _winEvtLogCount++;
  if (_winEvtLogCount <= 20) {
    console.log('[pixi-adapter] globalThis.addEventListener 注册:', type, '(共' + _windowListeners[type].length + '个)');
  }
}
function _windowRemoveEventListener(type, handler) {
  if (!_windowListeners[type]) return;
  const idx = _windowListeners[type].indexOf(handler);
  if (idx !== -1) _windowListeners[type].splice(idx, 1);
}
function _windowDispatchEvent(type, event) {
  const queue = _windowListeners[type];
  if (queue) {
    const copy = queue.slice();
    copy.forEach(handler => {
      try { handler(event); } catch (e) { console.error('[window event]', type, e); }
    });
  }
}
GameGlobal.__windowDispatchEvent = _windowDispatchEvent;
GameGlobal.__windowListenerWrapOk = false;

/** 把 add/removeEventListener 装到 obj 上；只读时改 defineProperty / 原型。 */
function _tryInstall(obj, name, fn) {
  if (!obj) return false;
  try {
    obj[name] = fn;
    if (obj[name] === fn) return true;
  } catch (e) { /* 只读 */ }
  try {
    _origDefineProperty.call(Object, obj, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: fn,
    });
    if (obj[name] === fn) return true;
  } catch (e) { /* 不可配置 */ }
  return false;
}

/**
 * 包装 window 的监听器：注册时同时写入 _windowListeners，触摸桥才能喂到 Pixi。
 * 返回是否包装成功。失败时不要当 fatal，TouchEvent 会走原生 dispatchEvent。
 */
function wrapWindowListeners(target) {
  if (!target || typeof target.addEventListener !== 'function') return false;
  var nativeAdd = target.addEventListener.bind(target);
  var nativeRemove = typeof target.removeEventListener === 'function'
    ? target.removeEventListener.bind(target)
    : function () {};

  function wrappedAdd(type, handler, options) {
    _windowAddEventListener(type, handler, options);
    try { return nativeAdd(type, handler, options); } catch (e) { /* 原生可能不认 pointer 事件 */ }
  }
  function wrappedRemove(type, handler, options) {
    _windowRemoveEventListener(type, handler);
    try { return nativeRemove(type, handler, options); } catch (e) { /* ignore */ }
  }

  var ok = _tryInstall(target, 'addEventListener', wrappedAdd)
    && _tryInstall(target, 'removeEventListener', wrappedRemove);
  // 模拟器的 Window 原型是宿主共享的，改原型会波及 IDE 自己的窗口，只改实例。
  if (!ok && !isDevtools) {
    var proto = Object.getPrototypeOf(target);
    if (proto && proto !== Object.prototype) {
      ok = _tryInstall(proto, 'addEventListener', wrappedAdd)
        && _tryInstall(proto, 'removeEventListener', wrappedRemove);
    }
  }
  if (ok) {
    console.log('[pixi-adapter] window.addEventListener 已包装');
  } else {
    console.log('[pixi-adapter] window.addEventListener 只读，触摸改走原生 dispatchEvent');
  }
  return ok;
}

// ======== 事件构造函数 ========
function _PointerEvent(type, opts) { this.type = type; Object.assign(this, opts || {}); }
function _TouchEventCtor(type, opts) { this.type = type; Object.assign(this, opts || {}); }
function _MouseEvent(type, opts) { this.type = type; Object.assign(this, opts || {}); }

// ======== URL / Blob ========
const _URL = {
  createObjectURL: function() { return ''; },
  revokeObjectURL: function() {},
};
function _Blob() {}

// ======== 所有需要挂载的全局属性 ========
const _allGlobals = {
  window: null,          // 下面特殊处理
  document: document,
  navigator: navigator,
  location: location,
  Image: Image,
  Element: Element,
  HTMLCanvasElement: HTMLCanvasElement,
  HTMLImageElement: HTMLImageElement,
  HTMLVideoElement: HTMLVideoElement,
  WebGLRenderingContext: _WebGLRenderingContext,
  CanvasRenderingContext2D: _CanvasRenderingContext2D,
  XMLHttpRequest: XMLHttpRequest,
  DOMParser: DOMParser,
  localStorage: localStorage,
  performance: _performance,
  canvas: canvas,
  ontouchstart: noop,
  addEventListener: _windowAddEventListener,
  removeEventListener: _windowRemoveEventListener,
  self: null,            // 下面特殊处理
  PointerEvent: _PointerEvent,
  TouchEvent: _TouchEventCtor,
  MouseEvent: _MouseEvent,
  URL: _URL,
  Blob: _Blob,
};

if (isDevtools) {
  // ======== 模拟器环境 ========
  // window 已存在（浏览器环境），用 defineProperty 补充/覆盖
  const _win = typeof window !== 'undefined' ? window : GameGlobal;

  for (const key in _allGlobals) {
    if (key === 'window' || key === 'self') continue;
    try {
      const desc = Object.getOwnPropertyDescriptor(_win, key);
      if (!desc || desc.configurable) {
        _origDefineProperty.call(Object, _win, key, { value: _allGlobals[key], configurable: true });
      }
    } catch (e) { /* 只读属性忽略 */ }
  }

  // PixiJS EventSystem 在 window 上注册 pointermove / pointerup。
  // 微信 3.15+ 模拟器把 window.addEventListener 做成只读，直接赋值会抛
  // “Cannot assign to read only property”。能包就包进 _windowListeners；
  // 包不上则标记失败，TouchEvent 改走原生 dispatchEvent。
  GameGlobal.__windowListenerWrapOk = wrapWindowListeners(_win);

  // document 属性补充
  try {
    for (const key in document) {
      const desc = Object.getOwnPropertyDescriptor(_win.document, key);
      if (!desc || desc.configurable) {
        _origDefineProperty.call(Object, _win.document, key, { value: document[key], configurable: true });
      }
    }
  } catch (e) { /* 忽略 */ }

} else {
  // ======== 真机环境 ========
  // 关键：必须同时挂载到 _realGlobal（JS 引擎全局对象）和 GameGlobal（跨文件共享）
  // 这样 IIFE bundle 中的自由变量 document、window 等才能正确解析

  // window = 全局对象自身（模拟浏览器行为）
  _realGlobal.window = _realGlobal;
  GameGlobal.window = _realGlobal;

  // self = 全局对象自身
  _realGlobal.self = _realGlobal;
  GameGlobal.self = _realGlobal;

  // addEventListener/removeEventListener 必须强制覆盖：
  // 微信框架可能内置了无效版本，PixiJS EventSystem 在 self 上注册
  // pointermove/pointerup 依赖这些函数正确工作
  var _forceOverwrite = new Set(['addEventListener', 'removeEventListener']);

  for (const key in _allGlobals) {
    if (key === 'window' || key === 'self') continue;
    var val = _allGlobals[key];
    var force = _forceOverwrite.has(key);
    // 挂到真正的全局作用域
    if (force || typeof _realGlobal[key] === 'undefined') {
      if (!_tryInstall(_realGlobal, key, val)) {
        try { _realGlobal[key] = val; } catch (e) { /* 只读 */ }
      }
    }
    // 同时挂到 GameGlobal
    if (force || typeof GameGlobal[key] === 'undefined') {
      if (!_tryInstall(GameGlobal, key, val)) {
        try { GameGlobal[key] = val; } catch (e) { /* 只读 */ }
      }
    }
  }

  GameGlobal.__windowListenerWrapOk =
    _realGlobal.addEventListener === _windowAddEventListener
    || (_realGlobal.self && _realGlobal.self.addEventListener === _windowAddEventListener);
  if (!GameGlobal.__windowListenerWrapOk) {
    GameGlobal.__windowListenerWrapOk = wrapWindowListeners(_realGlobal);
  }

  // 确认事件系统已正确挂载
  console.log('[pixi-adapter] 真机事件系统检查:',
    'wrapOk:', GameGlobal.__windowListenerWrapOk,
    ', globalThis.addEventListener === _windowAddEventListener:', _realGlobal.addEventListener === _windowAddEventListener,
    ', self.addEventListener === _windowAddEventListener:', (_realGlobal.self && _realGlobal.self.addEventListener === _windowAddEventListener));
}

// ======== 全局 canvas ========
// 微信框架可能已将 canvas 设为只读属性，需 try-catch 保护
try { GameGlobal.canvas = canvas; } catch (e) { /* 已由框架设置 */ }
try { _realGlobal.canvas = canvas; } catch (e) { /* 只读属性忽略 */ }

// ======== navigator.userAgent ========
try {
  if (_realGlobal.window && _realGlobal.window.navigator) {
    _realGlobal.window.navigator.userAgent = navigator.userAgent;
  }
} catch (e) { /* 只读属性忽略 */ }

// ======== 注册触摸事件 ========
try {
  registerTouchEvents();
} catch (e) {
  console.warn('[pixi-adapter] 触摸桥接失败，先保证能画出第一帧:', e);
}

console.log('[pixi-adapter] 初始化完成, 平台:', platform.name, ', 环境:', isDevtools ? '模拟器' : '真机');
console.log('[pixi-adapter] _realGlobal === GameGlobal:', _realGlobal === GameGlobal,
  ', typeof document:', typeof _realGlobal.document,
  ', typeof window:', typeof _realGlobal.window);
