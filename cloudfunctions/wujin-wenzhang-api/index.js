/**
 * 无尽纹章统一后端（CloudBase 云函数 + HTTP 访问服务）
 *
 * 路由（全部 POST JSON，health 兼 GET）：
 *   /login        登录：wx code2session / anon，签发 JWT
 *   /save/pull    拉取当前用户存档
 *   /save/push    上传当前用户存档（按 key 合并，updatedAt 防回写）
 *   /health       健康检查（无鉴权）
 *
 * 客户端可用两种方式命中：
 *   1) HTTP 访问服务：POST {envDomain}/wujin-wenzhang-api/login
 *      event 形如 { path, httpMethod, headers, body, isBase64Encoded }
 *   2) SDK callFunction：data: { action: 'login'|'save/pull'|'save/push', body: {...} }
 *
 * 环境变量（CloudBase 控制台 → 云函数 → 环境变量）：
 *   GAME_KEY                              必填；wujin_wenzhang
 *   WUJIN_WENZHANG_JWT_SECRET             必填；签发/校验 JWT
 *   WUJIN_WENZHANG_WX_APPID / WUJIN_WENZHANG_WX_SECRET
 *     微信 code2session（带游戏前缀是为了避开 CloudBase 对裸 WX_APPID/WX_SECRET 的脱敏清空）
 *   WUJIN_WENZHANG_SAVE_MAX_BYTES         可选，默认 262144（256KB）
 *   WUJIN_WENZHANG_TOKEN_TTL_SEC          可选，默认 604800（7d）
 */

const { handleLogin } = require('./lib/auth');
const { handlePull, handlePush } = require('./lib/save');
const { respond, parseEvent, preflight } = require('./lib/http');

const ROUTES = {
  'GET /health': async () => ({ ok: true, ts: Date.now() }),
  'POST /health': async () => ({ ok: true, ts: Date.now() }),
  'POST /login': handleLogin,
  'POST /save/pull': handlePull,
  'POST /save/push': handlePush,
};

exports.main = async (event, context) => {
  try {
    if (event && event.httpMethod === 'OPTIONS') {
      return preflight();
    }

    const req = parseEvent(event);
    const key = `${req.method} ${req.path}`;
    const handler = ROUTES[key];

    if (!handler) {
      return respond(404, { ok: false, code: 'NOT_FOUND', error: `no route: ${key}` });
    }

    const result = await handler(req, context);
    if (result && typeof result === 'object' && 'statusCode' in result) {
      return result;
    }
    return respond(200, { ok: true, data: result });
  } catch (e) {
    const code = e && e.code ? e.code : 'INTERNAL';
    const status = e && e.status ? e.status : 500;
    const message = (e && e.message) || String(e);
    console.error('[wujin-wenzhang-api] error:', code, message, e && e.stack);
    const out = { ok: false, code, error: message };
    if (e && e.data !== undefined) out.data = e.data;
    return respond(status, out);
  }
};
