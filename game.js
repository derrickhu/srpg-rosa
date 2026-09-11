// 对齐花花：鸿蒙卡在微信开屏时控制台经常是空的，用弹窗把启动日志亮出来。
var _diagMsgs = [];
var _diagStart = Date.now();

function _diag(msg) {
  var ts = Date.now() - _diagStart;
  _diagMsgs.push('[' + ts + 'ms] ' + msg);
  try { console.log('[game.js]', msg); } catch (_) {}
}

function _showDiag() {
  try {
    if (typeof wx !== 'undefined' && wx.showModal) {
      wx.showModal({
        title: '启动诊断',
        content: _diagMsgs.join('\n').slice(0, 1000),
        showCancel: false,
      });
    }
  } catch (_) {}
}

_diag('game.js 开始');

// 必须在 adapter / bundle 之前。Pixi TextMetrics 启动时会跑 `Intl==null`，
// typeof 包不住，鸿蒙没 ICU 会直接 ReferenceError，卡在微信开屏。
if (typeof Intl === 'undefined') {
  _diag('Intl不存在,注入polyfill');
  try { Intl = {}; } catch (_) {}
  var _g0 = (typeof globalThis !== 'undefined' && globalThis)
    || (typeof global !== 'undefined' && global)
    || {};
  if (typeof _g0.Intl === 'undefined') _g0.Intl = {};
  if (typeof GameGlobal !== 'undefined') GameGlobal.Intl = _g0.Intl;
}

try {
  if (typeof GameGlobal !== 'undefined') {
    GameGlobal.onError = function (msg) {
      _diag('onError:' + msg);
      _showDiag();
    };
    GameGlobal.onUnhandledRejection = function (ev) {
      _diag('unhandledRej:' + (ev && ev.reason || ev));
      _showDiag();
    };
  }
} catch (_) {}

try {
  if (typeof wx !== 'undefined') {
    if (wx.onError) {
      wx.onError(function (err) {
        _diag('wx.onError:' + (err && (err.message || err.errMsg) || err));
        _showDiag();
      });
    }
    if (wx.onUnhandledRejection) {
      wx.onUnhandledRejection(function (ev) {
        _diag('wx.unhandledRej:' + (ev && ev.reason || ev));
        _showDiag();
      });
    }
  }
} catch (_) {}

try {
  var _si = {};
  if (typeof wx !== 'undefined' && wx.getDeviceInfo && wx.getWindowInfo) {
    _si = Object.assign({}, wx.getDeviceInfo() || {}, wx.getWindowInfo() || {});
  } else if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
    _si = wx.getSystemInfoSync() || {};
  }
  _diag('platform:' + _si.platform + ' brand:' + _si.brand);
  _diag('model:' + _si.model + ' sdk:' + _si.SDKVersion);
} catch (e) {
  _diag('getSystemInfo失败:' + e);
}

_diag('加载 pixi-adapter...');
try {
  require('./minigame/pixi-adapter/index');
  _diag('pixi-adapter OK');
} catch (e) {
  _diag('pixi-adapter 失败:' + e);
  _showDiag();
}

_diag('加载 game-bundle...');
try {
  require('./minigame/game-bundle.js');
  _diag('game-bundle OK');
} catch (e) {
  _diag('game-bundle 失败:' + e);
  _showDiag();
}

_diag('全部加载完成');

setTimeout(function () {
  if (typeof GameGlobal !== 'undefined' && !GameGlobal.__srpgBooted && GameGlobal.__srpgTryBoot) {
    _diag('补踢 boot');
    try { GameGlobal.__srpgTryBoot(); } catch (e) { _diag('补踢失败:' + e); }
  }
}, 400);

// 只在 boot 根本没跑起来时弹。首帧已经画过、只是 Loading 慢，弹窗会被玩家当成闪退。
// 低端 Android 解析 1MB bundle + 建 WebGL 经常超过 5 秒，旧门槛会误伤打开成功率。
setTimeout(function () {
  if (typeof GameGlobal !== 'undefined' && !GameGlobal.__srpgBooted && !GameGlobal.__gameRendered) {
    _diag('8秒仍未启动');
    _showDiag();
  }
}, 8000);
