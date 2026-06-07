/**
 * navigator 对象模拟
 */

const platform = require('./platform');

let _sysInfo;
try {
  _sysInfo = platform.getSystemInfoSync();
} catch (e) {
  _sysInfo = {};
}

const navigator = {
  platform: _sysInfo.platform || 'unknown',
  language: _sysInfo.language || 'zh_CN',
  appVersion: '5.0 (MiniGame)',
  userAgent: 'Mozilla/5.0 (MiniGame; ' + (_sysInfo.platform || '') + ') PixiJS/7',
  onLine: true,
  maxTouchPoints: 10,
  vendor: '',
  product: '',
  productSub: '',
  hardwareConcurrency: 4,

  // PixiJS 可能会检查 gpu 信息
  gpu: '',
};

module.exports = navigator;
