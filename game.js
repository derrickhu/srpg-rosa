// 对齐花花：鸿蒙卡在微信开屏时控制台经常是空的，用弹窗把启动日志亮出来。
var _diagMsgs = [];
var _diagStart = Date.now();

function _diag(msg) {
  var ts = Date.now() - _diagStart;
  _diagMsgs.push('[' + ts + 'ms] ' + msg);
  try { console.log('[game.js]', msg); } catch (_) {}
}

try {
  if (typeof GameGlobal !== 'undefined') GameGlobal.__diag = _diag;
} catch (_) {}

function _fmtErr(err) {
  try {
    if (err == null) return String(err);
    if (typeof err === 'string') return err;
    var parts = [];
    if (err.message) parts.push(String(err.message));
    if (err.errMsg && err.errMsg !== err.message) parts.push(String(err.errMsg));
    if (err.stack) parts.push(String(err.stack).split('\n').slice(0, 4).join('|'));
    if (parts.length) return parts.join(' ').slice(0, 400);
    return JSON.stringify(err).slice(0, 400);
  } catch (_) {
    return String(err);
  }
}

function _booted() {
  try {
    return !!(typeof GameGlobal !== 'undefined' && (GameGlobal.__srpgBooted || GameGlobal.__gameRendered));
  } catch (_) {
    return false;
  }
}

function _host() {
  if (typeof tt !== 'undefined') return tt;
  if (typeof wx !== 'undefined') return wx;
  return null;
}

function _showDiag() {
  // 首帧已经出来之后再弹，玩家会当成闪退。后面的 wx.onError（比如 BGM）只打日志。
  if (_booted()) return;
  try {
    var host = _host();
    if (host && host.showModal) {
      host.showModal({
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
      _diag('onError:' + _fmtErr(msg));
      _showDiag();
    };
    GameGlobal.onUnhandledRejection = function (ev) {
      _diag('unhandledRej:' + _fmtErr(ev && ev.reason || ev));
      _showDiag();
    };
  }
} catch (_) {}

try {
  var _errHost = _host();
  if (_errHost) {
    if (_errHost.onError) {
      _errHost.onError(function (err) {
        _diag('wx.onError:' + _fmtErr(err));
        _showDiag();
      });
    }
    if (_errHost.onUnhandledRejection) {
      _errHost.onUnhandledRejection(function (ev) {
        _diag('wx.unhandledRej:' + _fmtErr(ev && ev.reason || ev));
        _showDiag();
      });
    }
  }
} catch (_) {}

try {
  var _si = {};
  var _infoHost = _host();
  if (_infoHost && _infoHost.getDeviceInfo && _infoHost.getWindowInfo) {
    _si = Object.assign({}, _infoHost.getDeviceInfo() || {}, _infoHost.getWindowInfo() || {});
  } else if (_infoHost && _infoHost.getSystemInfoSync) {
    _si = _infoHost.getSystemInfoSync() || {};
  }
  _diag('platform:' + _si.platform + ' brand:' + _si.brand);
  _diag('model:' + _si.model + ' sdk:' + _si.SDKVersion);
} catch (e) {
  _diag('getSystemInfo失败:' + e);
}

// 抖音侧边栏 / 桌面：onShow 可能早于 bundle，启动参数先记在 GameGlobal。
(function () {
  if (typeof tt === 'undefined' || typeof GameGlobal === 'undefined') return;
  GameGlobal.__launchInfo = {};
  GameGlobal.__sidebarSupported = false;
  GameGlobal.__desktopShortcutSupported = false;
  GameGlobal.__desktopShortcutStatus = null;
  try {
    if (typeof tt.onShow === 'function') {
      tt.onShow(function (res) { GameGlobal.__launchInfo = res || {}; });
    }
    var launch = typeof tt.getLaunchOptionsSync === 'function' ? tt.getLaunchOptionsSync() : null;
    if (launch) GameGlobal.__launchInfo = launch;
    var enter = typeof tt.getEnterOptionsSync === 'function' ? tt.getEnterOptionsSync() : null;
    if (enter) GameGlobal.__launchInfo = enter;
  } catch (e) {
    _diag('抖音 onShow 失败:' + e);
  }
  try {
    if (typeof tt.checkScene === 'function') {
      tt.checkScene({
        scene: 'sidebar',
        success: function (res) {
          GameGlobal.__sidebarSupported = !!(res && res.isExist);
        },
        fail: function () { GameGlobal.__sidebarSupported = false; },
      });
    }
  } catch (_) {}
  try {
    if (typeof tt.addShortcut === 'function') GameGlobal.__desktopShortcutSupported = true;
    if (typeof tt.checkShortcut === 'function') {
      tt.checkShortcut({
        success: function (res) {
          GameGlobal.__desktopShortcutStatus = res && res.status ? res.status : null;
        },
        fail: function () {},
      });
    }
  } catch (_) {}
})();

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
    if (GameGlobal.__bootStep) _diag('停在:' + GameGlobal.__bootStep);
    if (GameGlobal.__bootErr) _diag('err:' + String(GameGlobal.__bootErr).slice(0, 180));
    _diag('8秒仍未启动');
    _showDiag();
  }
}, 8000);
