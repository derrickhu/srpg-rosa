require('./minigame/pixi-adapter/index');
require('./minigame/game-bundle.js');

// 华为等机型 bundle 里的 rAF 可能永不回调。adapter 模块作用域里的 setTimeout 一定在。
setTimeout(function () {
  if (typeof GameGlobal !== 'undefined' && !GameGlobal.__srpgBooted && GameGlobal.__srpgTryBoot) {
    console.warn('[game.js] bundle 未启动，补踢一次 boot');
    try { GameGlobal.__srpgTryBoot(); } catch (e) { console.error('[game.js] 补踢 boot 失败', e); }
  }
}, 400);
