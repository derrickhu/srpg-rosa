/**
 * HTTP 层工具：响应封装 / CORS / event 解析。
 * 同时兼容两种触发方式：
 *   A) HTTP 访问服务：event 含 httpMethod/path/body
 *   B) SDK callFunction：event 为 { action, body }，无 httpMethod
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '86400',
};

function respond(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    isBase64Encoded: false,
  };
}

function preflight() {
  return {
    statusCode: 204,
    headers: { ...CORS_HEADERS },
    body: '',
    isBase64Encoded: false,
  };
}

function parseEvent(event) {
  event = event || {};

  if (event.httpMethod) {
    const method = String(event.httpMethod).toUpperCase();
    let path = event.path || '/';
    path = normalizePath(path);

    let rawBody = event.body || '';
    if (event.isBase64Encoded && rawBody) {
      try {
        rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
      } catch (_) {}
    }

    let body = {};
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch (_) {
        body = {};
      }
    }

    const headers = lowercaseHeaders(event.headers || {});
    return {
      method,
      path,
      body,
      headers,
      query: event.queryStringParameters || {},
      raw: event,
    };
  }

  const action = (event.action || '').replace(/^\/+/, '');
  const path = action ? `/${action}` : '/';
  return {
    method: 'POST',
    path,
    body: event.body || {},
    headers: lowercaseHeaders(event.headers || {}),
    query: {},
    raw: event,
  };
}

function normalizePath(path) {
  if (!path) return '/';
  let p = String(path);
  if (!p.startsWith('/')) p = '/' + p;
  // CloudBase HTTP 访问服务可能把挂载前缀一起给 path
  p = p.replace(/^\/(?:wujin-wenzhang-api)(?=\/|$)/, '');
  const fromEnv = String(process.env.GAME_KEY || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
  if (fromEnv) {
    const escaped = fromEnv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    p = p.replace(new RegExp(`^/${escaped}-api(?=/|$)`), '');
  }
  if (p === '') p = '/';
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

function lowercaseHeaders(h) {
  const out = {};
  for (const k of Object.keys(h || {})) {
    out[k.toLowerCase()] = h[k];
  }
  return out;
}

function httpError(status, code, message) {
  const err = new Error(message || code);
  err.status = status;
  err.code = code;
  return err;
}

module.exports = {
  respond,
  preflight,
  parseEvent,
  httpError,
};
