/**
 * Canvas 管理模块
 * 第一次 createCanvas() 返回主屏 canvas（小游戏环境特性，微信和抖音一致）
 */

const platform = require('./platform');

const canvas = platform.createCanvas();

module.exports = { canvas };
