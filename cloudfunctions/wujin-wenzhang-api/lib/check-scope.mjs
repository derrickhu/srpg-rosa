import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { getCollectionName, getScopedGameKey } = require('./config.js');

assert.equal(getScopedGameKey('wx'), 'wujin_wenzhang');
assert.equal(getCollectionName('playerData', 'wx'), 'wujin_wenzhang_playerData');
assert.equal(getCollectionName('playerData', 'anon'), 'wujin_wenzhang_playerData');

assert.equal(getScopedGameKey('dy'), 'wujin_wenzhang_tt');
assert.equal(getCollectionName('playerData', 'dy'), 'wujin_wenzhang_tt_playerData');
assert.equal(getCollectionName('playerData', 'tt'), 'wujin_wenzhang_tt_playerData');
assert.equal(getCollectionName('playerData', 'douyin'), 'wujin_wenzhang_tt_playerData');

assert.notEqual(
  getCollectionName('playerData', 'wx'),
  getCollectionName('playerData', 'dy'),
);

console.log('cloud config scope ok');
