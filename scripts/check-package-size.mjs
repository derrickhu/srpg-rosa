#!/usr/bin/env node
/**
 * 上传前算一遍主包体积，超限就红。
 *
 * 为什么需要这个脚本：微信的 `packOptions.ignore` 是**黑名单**——凡是没被显式排除的
 * 顶层目录都会被打进主包。于是往仓库里放任何东西（软著材料、参考图、导出中间产物）
 * 都会静默地进包，直到上传时才被 4MB 上限拦下来，报错只给一个总字节数，
 * 不告诉你是谁把包撑爆的。实际发生过一次：`softcopyright/`（32MB 软著 PDF 与截图）
 * 进了包，上传报 `source size 19951KB exceed max limit 4MB`。
 *
 * 这里复用 `project.config.json` 里那份 ignore 规则，所以它量的是**真实的包**，
 * 不是另写一份可能走岔的清单。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
/** 微信小游戏主包上限 4MB */
const LIMIT = 4 * 1024 * 1024;
/** 到这个比例就提前告警，免得贴着线才发现 */
const WARN_RATIO = 0.8;

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
const rules = cfg.packOptions?.ignore ?? [];

const folders = new Set(rules.filter((r) => r.type === 'folder').map((r) => r.value));
const files = new Set(rules.filter((r) => r.type === 'file').map((r) => r.value));
const globs = rules
  .filter((r) => r.type === 'glob')
  .map((r) => new RegExp(`^${r.value.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`));

// 微信的 ignore 只在项目里生效，但开发机上还有一堆本地目录（node_modules、.git 等）
// 已经写在 ignore 里了，所以这里不再另加默认排除项——多加就会和真实打包结果走岔。

/** @type {Map<string, number>} 顶层条目 → 字节数 */
const bySection = new Map();
let total = 0;

function walk(rel) {
  const abs = path.join(ROOT, rel || '.');
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const child = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (folders.has(child)) continue;
      walk(child);
    } else if (ent.isFile()) {
      if (files.has(child)) continue;
      if (globs.some((g) => g.test(child))) continue;
      const size = fs.statSync(path.join(ROOT, child)).size;
      const section = child.includes('/') ? child.slice(0, child.indexOf('/')) : '(根目录文件)';
      bySection.set(section, (bySection.get(section) ?? 0) + size);
      total += size;
    }
  }
}

walk('');

const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;
console.log('计入主包的内容：');
for (const [name, size] of [...bySection].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${mb(size).padStart(9)}  ${name}`);
}
console.log(`  ${'—'.repeat(9)}`);
console.log(`  ${mb(total).padStart(9)}  合计（上限 ${mb(LIMIT)}）`);

if (total > LIMIT) {
  console.error(
    `\n主包超限：${mb(total)} > ${mb(LIMIT)}。\n`
    + '要么把上面占大头的目录加进 project.config.json 的 packOptions.ignore，'
    + '要么把它移出仓库。',
  );
  process.exit(1);
}
if (total > LIMIT * WARN_RATIO) {
  console.warn(`\n注意：已用掉上限的 ${((total / LIMIT) * 100).toFixed(0)}%，余量不多了。`);
}
