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

// 花花同款：鸿蒙 platform 是 ohos，引擎只认 android/ios 时会当成桌面、去开 WebGL2。
const _platform = String(_sysInfo.platform || 'unknown');
const _isOHOS = _platform === 'ohos' || _platform === 'harmony' || _platform === 'harmonyos';

let _userAgent;
if (_isOHOS) {
  _userAgent = 'Mozilla/5.0 (Linux; Android 12; HarmonyOS; ' + (_sysInfo.model || 'HUAWEI') + ') AppleWebKit/537.36 (KHTML, like Gecko) MiniGame PixiJS/7';
} else if (_platform === 'android') {
  _userAgent = 'Mozilla/5.0 (Linux; Android; ' + (_sysInfo.model || '') + ') AppleWebKit/537.36 MiniGame PixiJS/7';
} else if (_platform === 'ios') {
  _userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS) AppleWebKit/537.36 MiniGame PixiJS/7';
} else {
  _userAgent = 'Mozilla/5.0 (MiniGame; ' + _platform + ') PixiJS/7';
}

const navigator = {
  platform: _isOHOS ? 'Linux armv8l' : (_sysInfo.platform || 'unknown'),
  language: _sysInfo.language || 'zh_CN',
  appVersion: '5.0 (MiniGame)',
  userAgent: _userAgent,
  onLine: true,
  maxTouchPoints: 10,
  vendor: '',
  product: '',
  productSub: '',
  hardwareConcurrency: 4,
  gpu: '',
};

module.exports = navigator;
