/**
 * CloudBase SDK 封装：复用同一个 app 与 collection 实例。
 * 集合名由 lib/config.js 的 GAME_KEY 派生。
 */

const tcb = require('@cloudbase/node-sdk');
const { getCollectionName } = require('./config');

let _app = null;

function getApp() {
  if (_app) return _app;
  _app = tcb.init({
    env: process.env.TCB_ENV || tcb.SYMBOL_CURRENT_ENV,
  });
  return _app;
}

function getDb() {
  return getApp().database();
}

function getCollection(platform) {
  return getDb().collection(getCollectionName('playerData', platform));
}

function collection(suffix, platform) {
  return getDb().collection(getCollectionName(suffix, platform));
}

module.exports = {
  getApp,
  getDb,
  getCollection,
  collection,
};
