/**
 * pixi-adapter 统一入口
 * 根据运行环境（真机/模拟器）将 DOM 模拟对象挂载到全局
 *
 * 关键：真机环境中 IIFE bundle 的自由变量（document、window 等）
 * 必须在 JS 引擎的全局作用域中可达，仅挂到 GameGlobal 不够——
 * GameGlobal 只是跨文件共享对象，不是全局作用域。
 * 因此真机需要挂到 globalThis / global 上。
 */

const platform = require('./platform');
const { noop } = require('./util');
const Image = require('./Image');
const { canvas } = require('./canvas');
const location = require('./location');
const document = require('./document');
const navigator = require('./navigator');
const localStorage = require('./localStorage');
const XMLHttpRequest = require('./XMLHttpRequest');
const { registerTouchEvents } = require('./TouchEvent');
const {
  Element,
  HTMLCanvasElement,
  HTMLImageElement,
  HTMLVideoElement,
} = require('./element');

// ======== 获取真正的 JS 全局对象 ========
// 优先 globalThis（ES2020+），其次 global（Node/V8），最后 GameGlobal
const _realGlobal = (typeof globalThis !== 'undefined' && globalThis)
  || (typeof global !== 'undefined' && global)
  || GameGlobal;

// ======== Patch Object.defineProperty ========
const _origDefineProperty = Object.defineProperty;
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
const sysInfo = platform.getSystemInfoSync();
const isDevtools = sysInfo.platform === 'devtools';

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

// ======== WebGL / Canvas2D 上下文构造函数 ========
let _WebGLRenderingContext = {};
try {
  const _tmpCanvas = platform.createCanvas();
  const _tmpGl = _tmpCanvas.getContext('webgl');
  if (_tmpGl) _WebGLRenderingContext = _tmpGl.constructor || {};
} catch (e) { /* 忽略 */ }

let _CanvasRenderingContext2D = {};
try {
  const _tmpCanvas2 = platform.createCanvas();
  const _tmpCtx = _tmpCanvas2.getContext('2d');
  if (_tmpCtx) _CanvasRenderingContext2D = _tmpCtx.constructor || {};
} catch (e) { /* 忽略 */ }

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

  // 关键修复：包装 window.addEventListener / removeEventListener
  // PixiJS EventSystem 在 globalThis(window) 上注册 pointermove / pointerup，
  // 但 adapter 通过 _windowListeners 分发触摸事件——两个系统完全隔离。
  // 包装后 handler 会同时进入 _windowListeners，adapter 的 dispatchToWindow 就能触达 PixiJS。
  try {
    var _nativeWinAdd = _win.addEventListener.bind(_win);
    var _nativeWinRemove = _win.removeEventListener.bind(_win);
    _win.addEventListener = function(type, handler, options) {
      _windowAddEventListener(type, handler, options);
      return _nativeWinAdd(type, handler, options);
    };
    _win.removeEventListener = function(type, handler, options) {
      _windowRemoveEventListener(type, handler);
      return _nativeWinRemove(type, handler, options);
    };
    console.log('[pixi-adapter] 模拟器 window.addEventListener 已包装');
  } catch (e) {
    console.warn('[pixi-adapter] 包装 window.addEventListener 失败:', e);
  }

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
      try { _realGlobal[key] = val; } catch (e) { /* 忽略 */ }
    }
    // 同时挂到 GameGlobal
    if (force || typeof GameGlobal[key] === 'undefined') {
      try { GameGlobal[key] = val; } catch (e) { /* 忽略 */ }
    }
  }

  // 确认事件系统已正确挂载
  console.log('[pixi-adapter] 真机事件系统检查:',
    'globalThis.addEventListener === _windowAddEventListener:', _realGlobal.addEventListener === _windowAddEventListener,
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
registerTouchEvents();

console.log('[pixi-adapter] 初始化完成, 平台:', platform.name, ', 环境:', isDevtools ? '模拟器' : '真机');
console.log('[pixi-adapter] _realGlobal === GameGlobal:', _realGlobal === GameGlobal,
  ', typeof document:', typeof _realGlobal.document,
  ', typeof window:', typeof _realGlobal.window);
