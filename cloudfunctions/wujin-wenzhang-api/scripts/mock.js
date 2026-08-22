/**
 * 本地联调 mock：不依赖 CloudBase，把 save 集合读写替换为内存。
 * 运行：node cloudfunctions/wujin-wenzhang-api/scripts/mock.js
 */

process.env.GAME_KEY = process.env.GAME_KEY || 'wujin_wenzhang';
process.env.WUJIN_WENZHANG_JWT_SECRET =
  process.env.WUJIN_WENZHANG_JWT_SECRET || 'dev-secret-do-not-use-in-prod';
process.env.WUJIN_WENZHANG_TOKEN_TTL_SEC = process.env.WUJIN_WENZHANG_TOKEN_TTL_SEC || '3600';

const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === '@cloudbase/node-sdk') {
    return require.resolve('./fake-tcb.js');
  }
  return origResolve.call(this, request, parent, ...rest);
};

const { main } = require('../index');

async function httpCall(method, path, body, headers = {}) {
  const event = {
    httpMethod: method,
    path,
    headers: { 'content-type': 'application/json', ...headers },
    queryStringParameters: {},
    body: body === undefined ? '' : (typeof body === 'string' ? body : JSON.stringify(body || {})),
    isBase64Encoded: false,
  };
  const res = await main(event, {});
  const parsed = res && res.body
    ? (() => { try { return JSON.parse(res.body); } catch { return res.body; } })()
    : res;
  console.log(`[${method} ${path}]`, res && res.statusCode, JSON.stringify(parsed));
  return { statusCode: res && res.statusCode, body: parsed };
}

async function call(path, body, headers = {}) {
  return httpCall('POST', path, body, headers);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const login = await call('/wujin-wenzhang-api/login', { platform: 'anon', anonId: 'testuser-0001' });
  const token = login.body && login.body.data && login.body.data.token;
  assert(token, 'login failed');
  assert(login.body.data.gameKey === 'wujin_wenzhang', 'login gameKey mismatch');
  const auth = { authorization: `Bearer ${token}` };

  const emptyPull = await call('/save/pull', {}, auth);
  assert(emptyPull.body.data.exists === false, 'first pull should be empty');

  const now = Date.now();
  const push1 = await call('/save/push', {
    schemaVersion: 1,
    updatedAt: now,
    baseRemoteUpdatedAt: 0,
    clientFingerprint: 'mock|dev',
    payload: { srpg_meta_v3: JSON.stringify({ version: 3, soul: 100 }) },
  }, auth);
  assert(push1.statusCode === 200 && push1.body.data.mode === 'insert', 'first push should insert');

  const pull1 = await call('/save/pull', {}, auth);
  assert(pull1.body.data.exists === true, 'second pull should exist');
  assert(pull1.body.data.payload.srpg_meta_v3.indexOf('"soul":100') >= 0, 'payload mismatch');

  const stale = await call('/save/push', {
    schemaVersion: 1,
    updatedAt: now - 1000,
    baseRemoteUpdatedAt: now,
    clientFingerprint: 'mock|dev',
    payload: { srpg_meta_v3: JSON.stringify({ version: 3, soul: 50 }) },
  }, auth);
  assert(stale.statusCode === 409 && stale.body.code === 'STALE_UPDATE', 'old updatedAt should 409');

  const staleBase = await call('/save/push', {
    schemaVersion: 1,
    updatedAt: now + 1000,
    baseRemoteUpdatedAt: 0,
    clientFingerprint: 'mock|dev',
    payload: { srpg_meta_v3: JSON.stringify({ version: 3, soul: 20 }) },
  }, auth);
  assert(staleBase.statusCode === 409 && staleBase.body.code === 'STALE_UPDATE', 'old baseline should 409');

  const push2 = await call('/save/push', {
    schemaVersion: 1,
    updatedAt: now + 1000,
    baseRemoteUpdatedAt: now,
    clientFingerprint: 'mock|dev',
    payload: {
      srpg_meta_v3: JSON.stringify({ version: 3, soul: 200 }),
      srpg_run_v4: JSON.stringify({ dungeonId: 'ch1' }),
    },
  }, auth);
  assert(push2.statusCode === 200 && push2.body.data.mode === 'update', 'merge push should update');

  const pull2 = await call('/save/pull', {}, auth);
  assert(pull2.body.data.payload.srpg_run_v4.indexOf('ch1') >= 0, 'merge should keep new key');
  assert(pull2.body.data.payload.srpg_meta_v3.indexOf('"soul":200') >= 0, 'merge should overwrite meta');

  const noToken = await call('/save/pull', {});
  assert(noToken.statusCode === 401, 'missing token should 401');

  const jwt = require('jsonwebtoken');
  const otherGk = jwt.sign(
    { sub: 'anon:testuser-0001', plt: 'anon', gk: 'huahua', iat: Math.floor(Date.now() / 1000) },
    process.env.WUJIN_WENZHANG_JWT_SECRET,
    { expiresIn: 3600 },
  );
  const other = await call('/save/pull', {}, { authorization: `Bearer ${otherGk}` });
  assert(other.statusCode === 401, 'foreign gameKey token should 401');

  const big = 'x'.repeat(300 * 1024);
  const tooBig = await call('/save/push', {
    schemaVersion: 1,
    updatedAt: now + 2000,
    baseRemoteUpdatedAt: now + 1000,
    clientFingerprint: 'mock|dev',
    payload: { srpg_meta_v3: big },
  }, auth);
  assert(tooBig.statusCode === 413, 'oversized payload should 413');

  const health = await httpCall('GET', '/health');
  assert(health.statusCode === 200 && health.body.data.ok === true, 'health should ok');

  console.log('\n[mock] 全部用例运行完毕');
})().catch((e) => {
  console.error('[mock] 失败:', e);
  process.exit(1);
});
