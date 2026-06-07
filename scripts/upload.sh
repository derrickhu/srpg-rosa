#!/usr/bin/env bash
# 零参数 CDN 资源上传 — 无尽纹章（GameKey = wujin_wenzhang）
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/upload_cdn.js "$@"
