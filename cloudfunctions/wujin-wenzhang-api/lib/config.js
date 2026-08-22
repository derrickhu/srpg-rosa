/**
 * 游戏级配置（多游戏复用模板的唯一可变点）
 *
 *   GAME_KEY                           游戏代号，如 wujin_wenzhang
 *                                      决定：集合前缀 ${GAME_KEY}_xxx、JWT payload 里的 gk
 *   {GAMEKEY_UPPER}_JWT_SECRET         当前游戏的 JWT 签名密钥
 *   {GAMEKEY_UPPER}_TOKEN_TTL_SEC      token 有效期（秒），默认 7d
 *   {GAMEKEY_UPPER}_SAVE_MAX_BYTES     payload 上限（字节），默认 256KB
 *
 * 集合命名约定：
 *   ${GAME_KEY}_playerData  存档主表
 *   ${GAME_KEY}_xxx         未来扩展表
 */

const DEFAULT_GAME_KEY = 'wujin_wenzhang';
const DEFAULT_TTL_SEC = 7 * 24 * 3600;
const DEFAULT_MAX_BYTES = 256 * 1024;

function getGameKey() {
  const v = String(process.env.GAME_KEY || '').trim().toLowerCase();
  if (!v) return DEFAULT_GAME_KEY;
  if (!/^[a-z][a-z0-9_\-]{0,31}$/.test(v)) {
    throw new Error(`GAME_KEY 非法: "${v}"（要求小写字母开头，字母数字/下划线/连字符，长度 1~32）`);
  }
  return v;
}

function gameKeyUpper() {
  return getGameKey().toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

function readEnvPrefer(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v !== undefined && v !== null && String(v).length > 0) return String(v);
  }
  return '';
}

/** 后端 platform 字段 → 集合命名空间段。微信 / 匿名不加段。 */
const PLATFORM_SCOPE = {
  dy: 'tt',
};

function getPlatformScope(platform) {
  return PLATFORM_SCOPE[String(platform || '').toLowerCase()] || '';
}

function getScopedGameKey(platform) {
  const scope = getPlatformScope(platform);
  return scope ? `${getGameKey()}_${scope}` : getGameKey();
}

function scopedKeyUpper(platform) {
  return getScopedGameKey(platform).toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

/**
 * 集合名：微信/匿名 wujin_wenzhang_playerData。
 * 可用 {SCOPED_GAME_KEY}_{SUFFIX}_COLLECTION 覆盖。
 */
function getCollectionName(suffix, platform) {
  const normalizedSuffix = String(suffix || '').replace(/^_+/, '');
  const override = process.env[`${scopedKeyUpper(platform)}_${normalizedSuffix.toUpperCase()}_COLLECTION`];
  if (override) return String(override);
  return `${getScopedGameKey(platform)}_${normalizedSuffix}`;
}

function getJwtSecret() {
  return readEnvPrefer(`${gameKeyUpper()}_JWT_SECRET`);
}

function getTtlSec() {
  const raw = readEnvPrefer(`${gameKeyUpper()}_TOKEN_TTL_SEC`);
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_TTL_SEC;
}

function getMaxBytes() {
  const raw = readEnvPrefer(`${gameKeyUpper()}_SAVE_MAX_BYTES`);
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_MAX_BYTES;
}

module.exports = {
  getGameKey,
  gameKeyUpper,
  getPlatformScope,
  getScopedGameKey,
  getCollectionName,
  getJwtSecret,
  getTtlSec,
  getMaxBytes,
};
