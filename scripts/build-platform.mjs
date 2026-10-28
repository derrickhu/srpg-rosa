#!/usr/bin/env node
/**
 * 组装抖音开发者工具工程到 build/douyin。
 *
 * 微信仍用仓库根目录（npm run build）。
 * 抖音工具必须打开 build/douyin，不要开仓库根。
 *
 * 拷贝范围跟 project.config.json 的 packOptions.ignore 一致，
 * 再额外排除 build/、platform/、.git，避免把模板和上一次产物打进去。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platformName = process.argv[2] || 'douyin';
const LIMIT = 4 * 1024 * 1024;

function fail(msg) {
  console.error(`\n[build-platform] ${msg}`);
  process.exit(1);
}

if (platformName !== 'douyin') {
  fail('目前只组装 douyin。微信工程就是仓库根目录，用 npm run build。');
}

const out = path.join(root, 'build', platformName);
const wechatCfg = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
const rules = wechatCfg.packOptions?.ignore ?? [];
const folders = new Set(rules.filter((r) => r.type === 'folder').map((r) => r.value));
const files = new Set(rules.filter((r) => r.type === 'file').map((r) => r.value));
const globs = rules
  .filter((r) => r.type === 'glob')
  .map((r) => new RegExp(`^${r.value.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`));

const ALWAYS_SKIP_TOP = new Set(['build', '.git', 'platform']);
const ALWAYS_SKIP_FILE = new Set(['project.config.json', 'project.private.config.json']);

function skipped(rel) {
  const top = rel.split('/')[0];
  if (ALWAYS_SKIP_TOP.has(top)) return true;
  if (!rel.includes('/') && ALWAYS_SKIP_FILE.has(rel)) return true;
  if (folders.has(rel) || files.has(rel)) return true;
  if (globs.some((g) => g.test(rel))) return true;
  return false;
}

function copyTree(srcDir, destDir, rel) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (ent.name === '.DS_Store') continue;
    const childRel = rel ? `${rel}/${ent.name}` : ent.name;
    if (skipped(childRel)) continue;
    const from = path.join(srcDir, ent.name);
    const to = path.join(destDir, ent.name);
    const st = fs.statSync(from);
    if (st.isDirectory()) {
      copyTree(from, to, childRel);
    } else if (st.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

let prevAppid = '';
const prevCfgPath = path.join(out, 'project.config.json');
if (fs.existsSync(prevCfgPath)) {
  try {
    const prev = JSON.parse(fs.readFileSync(prevCfgPath, 'utf8'));
    const id = String(prev.appid || '');
    if (id && !id.startsWith('wx')) prevAppid = id;
  } catch {
    prevAppid = '';
  }
}

// 先写到临时目录，再覆盖进 build/douyin。
// 不能先 rm 整个目录：抖音开发者工具正看着这个文件夹时，会在 game.json 被删掉的空窗里编译，报 can't find game.json。
const staging = path.join(root, 'build', `.${platformName}-staging`);
fs.rmSync(staging, { recursive: true, force: true });
copyTree(root, staging, '');

const templatePath = path.join(root, 'platform', platformName, 'project.config.json');
if (!fs.existsSync(templatePath)) fail(`缺少 ${templatePath}`);
const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
template.packOptions = wechatCfg.packOptions;
if (!template.appid && prevAppid) template.appid = prevAppid;
fs.writeFileSync(path.join(staging, 'project.config.json'), `${JSON.stringify(template, null, 2)}\n`);

const gameJsonSrc = path.join(root, 'platform', platformName, 'game.json');
if (!fs.existsSync(gameJsonSrc)) fail(`缺少 ${gameJsonSrc}`);
fs.copyFileSync(gameJsonSrc, path.join(staging, 'game.json'));

if (!fs.existsSync(path.join(staging, 'game.js'))) fail('组装结果里没有 game.js');
if (!fs.existsSync(path.join(staging, 'minigame', 'game-bundle.js'))) {
  fail('组装结果里没有 minigame/game-bundle.js，先跑 vite build');
}

const preserveNames = new Set(['project.private.config.json']);
function listNames(dir) {
  return fs.readdirSync(dir).filter((name) => name !== '.DS_Store');
}
function overlay(from, to) {
  fs.mkdirSync(to, { recursive: true });
  const incoming = new Set(listNames(from));
  for (const name of listNames(to)) {
    if (preserveNames.has(name) || incoming.has(name)) continue;
    fs.rmSync(path.join(to, name), { recursive: true, force: true });
  }
  for (const name of incoming) {
    const src = path.join(from, name);
    const dest = path.join(to, name);
    if (fs.statSync(src).isDirectory()) overlay(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

if (!fs.existsSync(out)) fs.renameSync(staging, out);
else {
  overlay(staging, out);
  fs.rmSync(staging, { recursive: true, force: true });
}

if (!fs.existsSync(path.join(out, 'game.json'))) fail('build/douyin 里没有 game.json');

let total = 0;
const bySection = new Map();
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.DS_Store') continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    total += st.size;
    const rel = path.relative(out, full);
    const section = rel.includes(path.sep) ? rel.slice(0, rel.indexOf(path.sep)) : '(根目录文件)';
    bySection.set(section, (bySection.get(section) ?? 0) + st.size);
  }
}
walk(out);

const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;
console.log(`[build-platform] ${platformName} → ${path.relative(root, out)}`);
for (const [name, size] of [...bySection].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${mb(size).padStart(9)}  ${name}`);
}
console.log(`  ${mb(total).padStart(9)}  合计（上限 ${mb(LIMIT)}）`);
if (!template.appid) {
  console.warn('[build-platform] 抖音 appid 还是空的。上传前在抖音开发者工具里填，或写进 platform/douyin/project.config.json 后重打。');
}
if (total > LIMIT) {
  fail(`主包 ${mb(total)} 超过 4MB`);
}
