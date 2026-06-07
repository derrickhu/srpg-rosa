'use strict'
/**
 * 本地脚本配置加载器。
 *
 * 读取顺序：
 *   1. scripts/.cdn_secret
 *   2. 当前进程环境变量（优先级最高）
 *
 * CDN 上传只需要腾讯云 COS 密钥；微信 URL Link 工具使用 XIAOCHU_WX_SECRET。
 */
const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.resolve(__dirname, '..')

function readEnvFile(filePath) {
  const out = {}
  if (!fs.existsSync(filePath)) return out
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
  return out
}

function loadEnv() {
  const secretFile = path.join(__dirname, '.cdn_secret')
  return {
    ...readEnvFile(secretFile),
    ...process.env,
  }
}

function loadUploadEnv() {
  const env = loadEnv()
  return {
    tencentSecretId: env.TENCENTCLOUD_SECRET_ID || '',
    tencentSecretKey: env.TENCENTCLOUD_SECRET_KEY || '',
    tencentRegion: env.TENCENTCLOUD_REGION || '',
    cloudBucket: env.CDN_CLOUD_BUCKET || '',
    cdnBaseUrl: env.CDN_BASE_URL || '',
  }
}

function loadWechatOpenApiSecret() {
  const env = loadEnv()
  return env.XIAOCHU_WX_SECRET || env.WX_SECRET || ''
}

module.exports = { loadEnv, loadUploadEnv, loadWechatOpenApiSecret, PROJECT_ROOT }
