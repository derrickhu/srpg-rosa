/**
 * 登录 / Token 认证
 *
 * - wx: 调 api.weixin.qq.com/sns/jscode2session
 * - dy: 调 developer.toutiao.com/api/apps/v2/jscode2session
 * - anon: 直接把客户端传的 anonId 作为 userId 后缀
 */

const jwt = require('jsonwebtoken');
const { httpError } = require('./http');
const {
  getGameKey,
  gameKeyUpper,
  getJwtSecret: _readJwtSecret,
  getTtlSec,
} = require('./config');

const SUPPORTED_PLATFORMS = new Set(['wx', 'dy', 'tap', 'anon']);

function getJwtSecret() {
  const s = _readJwtSecret();
  if (!s) {
    throw httpError(500, 'NO_JWT_SECRET', `${gameKeyUpper()}_JWT_SECRET 未配置`);
  }
  return s;
}

async function handleLogin(req) {
  const body = req.body || {};
  const platform = String(body.platform || '').toLowerCase();
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    throw httpError(400, 'BAD_PLATFORM', `unsupported platform: ${platform}`);
  }

  let platformUid = '';

  if (platform === 'wx') {
    platformUid = await wxCode2Openid(body.code);
  } else if (platform === 'dy') {
    platformUid = await ttCode2Openid(body.code);
  } else if (platform === 'tap') {
    const id = String(body.taptapUserId || '').trim();
    if (!id) throw httpError(400, 'NO_TAP_ID', 'taptapUserId 缺失');
    platformUid = id;
  } else if (platform === 'anon') {
    const id = String(body.anonId || '').trim();
    if (!id) throw httpError(400, 'NO_ANON_ID', 'anonId 缺失');
    if (!/^[A-Za-z0-9_\-:.]{8,128}$/.test(id)) {
      throw httpError(400, 'BAD_ANON_ID', 'anonId 非法');
    }
    platformUid = id;
  }

  const userId = `${platform}:${platformUid}`;
  const ttlSec = getTtlSec();
  const secret = getJwtSecret();
  const gameKey = getGameKey();
  const now = Math.floor(Date.now() / 1000);

  const token = jwt.sign(
    { sub: userId, plt: platform, gk: gameKey, iat: now },
    secret,
    { expiresIn: ttlSec },
  );

  return {
    token,
    userId,
    platform,
    gameKey,
    expiresAt: (now + ttlSec) * 1000,
    ttlSec,
  };
}

function requireUser(req) {
  const authHeader = (req.headers && req.headers.authorization) || '';
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) throw httpError(401, 'NO_TOKEN', '缺少 Authorization: Bearer <token>');
  const token = m[1].trim();

  let payload;
  try {
    payload = jwt.verify(token, getJwtSecret());
  } catch (e) {
    throw httpError(401, 'BAD_TOKEN', e && e.message ? e.message : 'token 无效');
  }

  const userId = payload && payload.sub;
  if (!userId || typeof userId !== 'string' || !userId.includes(':')) {
    throw httpError(401, 'BAD_TOKEN', 'token sub 非法');
  }

  const currentGk = getGameKey();
  if (payload.gk && payload.gk !== currentGk) {
    throw httpError(401, 'BAD_TOKEN', `token gameKey=${payload.gk} 与当前 GAME_KEY=${currentGk} 不匹配`);
  }

  return { userId, platform: payload.plt || userId.split(':')[0] };
}

function readPrefixedCreds(kind) {
  const gk = gameKeyUpper();
  const appid = process.env[`${gk}_${kind}_APPID`] || process.env[`${kind}_APPID`];
  const secret = process.env[`${gk}_${kind}_SECRET`] || process.env[`${kind}_SECRET`];
  return { appid, secret };
}

async function wxCode2Openid(code) {
  const { appid, secret } = readPrefixedCreds('WX');
  if (!appid || !secret) {
    throw httpError(500, 'NO_WX_CFG', `${gameKeyUpper()}_WX_APPID/${gameKeyUpper()}_WX_SECRET 未配置`);
  }
  if (!code) throw httpError(400, 'NO_CODE', 'wx code 缺失');

  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const data = await httpGetJson(url);
  if (!data || !data.openid) {
    throw httpError(401, 'WX_LOGIN_FAIL', `wx code2session 失败: ${JSON.stringify(data || {})}`);
  }
  return data.openid;
}

async function ttCode2Openid(code) {
  const { appid, secret } = readPrefixedCreds('TT');
  if (!appid || !secret) {
    throw httpError(500, 'NO_TT_CFG', `${gameKeyUpper()}_TT_APPID/${gameKeyUpper()}_TT_SECRET 未配置`);
  }
  if (!code) throw httpError(400, 'NO_CODE', 'dy code 缺失');

  const url = 'https://developer.toutiao.com/api/apps/v2/jscode2session';
  const data = await httpPostJson(url, { appid, secret, code });
  if (!data || data.err_no !== 0 || !data.data || !data.data.openid) {
    throw httpError(401, 'TT_LOGIN_FAIL', `dy code2session 失败: ${JSON.stringify(data || {})}`);
  }
  return data.data.openid;
}

function httpGetJson(url) {
  return httpRequestJson(url, 'GET');
}

function httpPostJson(url, body) {
  return httpRequestJson(url, 'POST', body);
}

function httpRequestJson(url, method, body) {
  if (typeof fetch !== 'function') {
    return Promise.reject(httpError(500, 'NO_FETCH', '当前 Node 运行时不支持 fetch，请使用 Node 18+'));
  }
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(url, opts).then(async (res) => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (_) {
      return { _raw: text };
    }
  });
}

module.exports = {
  handleLogin,
  requireUser,
};
