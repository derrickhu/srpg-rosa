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

const platform = {
  createCanvas: () => _api.createCanvas(),
  createImage: () => _api.createImage(),

  getSystemInfoSync: () => _api.getSystemInfoSync(),

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
