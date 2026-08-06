#!/usr/bin/env node
/**
 * 就地重算所有动画清单的 metrics，不重新打包图集。
 *
 * 用途：metrics 的算法（scripts/lib/animAtlas.mjs 的 bodySpan）改动后，让已有资产跟上，
 * 而不必回去重跑 Godot 导出或 generate2dsprite——那些源产物不一定还在手边。
 * 算法从 animAtlas 里 import，保证和打包期是同一份，不会漂移。
 *
 *   node scripts/remetrics.mjs          # 写回
 *   node scripts/remetrics.mjs --dry    # 只打印对比
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { bodySpan, MANIFEST_DIR } from './lib/animAtlas.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dry = process.argv.includes('--dry');

/** 图集里的帧区域已经是裁剪后的包围盒，直接取前景掩码 */
function frameMask(png, f) {
  const mask = new Uint8Array(f.w * f.h);
  for (let row = 0; row < f.h; row++) {
    const base = ((f.y + row) * png.width + f.x) * 4;
    for (let x = 0; x < f.w; x++) {
      if (png.data[base + x * 4 + 3] !== 0) mask[row * f.w + x] = 1;
    }
  }
  return mask;
}

const dir = path.join(root, MANIFEST_DIR);
let changed = 0;
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const abs = path.join(dir, file);
  const m = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (!m.metrics) continue;

  const refKey =
    m.animations.default?.frames[0] ?? m.animations.idle?.frames[0] ?? Object.keys(m.frames)[0];
  const entry = m.frames[refKey];
  const atlas = PNG.sync.read(fs.readFileSync(path.join(root, m.image)));
  const f = entry.frame;
  const span = bodySpan(frameMask(atlas, f), f.w, f.h);

  const next = {
    frameSize: entry.sourceSize.h,
    subjectHeight: span.bottom - span.top,
    baselineY: entry.spriteSourceSize.y + span.bottom,
    ref: refKey,
  };
  const old = m.metrics;
  const same = next.subjectHeight === old.subjectHeight && next.baselineY === old.baselineY;
  const pct = ((100 * next.subjectHeight) / (entry.frame.h || 1)).toFixed(0);
  console.log(
    `${file.replace('.json', '').padEnd(12)} 身体 ${String(old.subjectHeight).padStart(4)} -> ` +
      `${String(next.subjectHeight).padStart(4)} (占包围盒 ${pct}%)  ` +
      `脚线 ${old.baselineY} -> ${next.baselineY}${same ? '  [无变化]' : ''}`,
  );
  if (same || dry) continue;
  m.metrics = next;
  fs.writeFileSync(abs, JSON.stringify(m, null, 2) + '\n', 'utf8');
  changed++;
}
console.log(dry ? '\n--dry 未写入' : `\n已更新 ${changed} 个清单`);
