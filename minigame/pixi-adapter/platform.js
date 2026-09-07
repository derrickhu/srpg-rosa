/**
 * 平台抽象层 - 统一微信/抖音小游戏 API
 * 所有 adapter 模块通过此模块调用平台 API，不直接写 wx.xxx 或 tt.xxx
 */

const _isWechat = typeof wx !== 'undefined';
const _isDouyin = typeof tt !== 'undefined';
const _api = _isWechat ? wx : _isDouyin ? tt : null;

if (!_api) {
  console.error('[platform] 未检测到小游戏运行环境（wx/tt）');
}

function safeSystemInfo() {
  if (!_api) return {};
  try {
    if (typeof _api.getWindowInfo === 'function' && typeof _api.getDeviceInfo === 'function') {
      const win = _api.getWindowInfo() || {};
      const dev = _api.getDeviceInfo() || {};
      return Object.assign({}, dev, win);
    }
  } catch (e) { /* 新 API 在旧基础库会抛 */ }
  try {
    return _api.getSystemInfoSync() || {};
  } catch (e2) {
    return {};
  }
}

function dummyCanvas() {
  return { width: 0, height: 0, getContext: function () { return null; } };
}

function dummyImage() {
  return { src: '', onload: null, onerror: null };
}

const platform = {
  createCanvas: () => {
    if (!_api || typeof _api.createCanvas !== 'function') return dummyCanvas();
    try { return _api.createCanvas(); } catch (e) { return dummyCanvas(); }
  },
  createImage: () => {
    if (!_api || typeof _api.createImage !== 'function') return dummyImage();
    try { return _api.createImage(); } catch (e) { return dummyImage(); }
  },

  getSystemInfoSync: safeSystemInfo,

  getStorageSync: (key) => _api.getStorageSync(key),
  setStorageSync: (key, data) => _api.setStorageSync(key, data),
  removeStorageSync: (key) => _api.removeStorageSync(key),

  request: (opts) => _api.request(opts),
  connectSocket: (opts) => _api.connectSocket(opts),

  onTouchStart: (cb) => _api.onTouchStart(cb),
  onTouchMove: (cb) => _api.onTouchMove(cb),
  onTouchEnd: (cb) => _api.onTouchEnd(cb),
  onTouchCancel: (cb) => _api.onTouchCancel(cb),
  offTouchStart: (cb) => _api.offTouchStart(cb),
  offTouchMove: (cb) => _api.offTouchMove(cb),
  offTouchEnd: (cb) => _api.offTouchEnd(cb),
  offTouchCancel: (cb) => _api.offTouchCancel(cb),

  createInnerAudioContext: () => _api.createInnerAudioContext(),

  name: _isWechat ? 'wechat' : _isDouyin ? 'douyin' : 'unknown',
  api: _api,
};

module.exports = platform;
