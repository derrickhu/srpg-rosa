#!/usr/bin/env node
/**
 * tres2pixi —— 把 Godot SpriteFrames(.tres) 转成 Pixi 图集(atlas) + 动画清单。
 *
 * 设计边界：只转「序列帧」。Godot 运行时特性（粒子/shader/AnimationPlayer/Tween）
 * 不会被导出，需要在 Godot 里烘焙成 PNG 序列，或在 Pixi 里另行实现。
 *
 * 产物（每个集合一张图集，减少微信小游戏请求数与 draw call）：
 *   - 图集 PNG  → images/anim/<id>.png        （裁剪透明边后 shelf 打包）
 *   - 清单 JSON → src/data/anim/<id>.json      （TexturePacker-Hash 兼容的 frames/meta
 *                                               + 每动画 fps/loop + blend，构建时打进 JS）
 *
 * 字段映射：Godot speed(FPS) → fps；loop → loop；name → 动画名；frames 顺序保持。
 * 混合模式 blend 取自 Godot 场景 material（.tres 不含），在 SETS 里手动声明。
 *
 * 用法：node scripts/tres2pixi.mjs  （或 npm run anim:build）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { hasPngquant, writeAnimSet } from './lib/animAtlas.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/**
 * 要转换的资源集合。id 决定图集名与清单文件名。
 * blend：'normal' 普通；'add' 叠加（黑底发光特效，对应 Godot blend_mode=1）。
 * downscale：源帧整数降采样倍数（2 = 512→256），减小图集体积；游戏按贴图原始尺寸缩放，
 *            降采样对显示尺寸透明（仅清晰度变化）。棋盘单位显示约 100px，512 富余可降。
 */
const SETS = [
  // slash 已迁到 AI 管线（scripts/sprite2anim.mjs 的 art/vfx-runs/slash）。
  // 两个脚本写同一个 src/data/anim 目录，同 id 会互相覆盖。
];

function resToDisk(resPath) {
  return resPath.replace(/^res:\/\//, 'godot/');
}

function tresResBaseDir(tresDiskPath) {
  const rel = tresDiskPath.replace(/^godot\//, '');
  return 'res://' + path.dirname(rel);
}

/** 解析 .tres：返回 animations:[{name,loop,fps,frames:[res://...]}] */
function parseTres(text) {
  const idToPath = {};
  const extRe = /\[ext_resource[^\]]*?path="([^"]+)"[^\]]*?id="?([^"\]]+)"?\]/g;
  let m;
  while ((m = extRe.exec(text)) !== null) idToPath[m[2]] = m[1];

  const startIdx = text.indexOf('animations');
  if (startIdx < 0) throw new Error('未找到 animations 段');
  const arrStart = text.indexOf('[', startIdx);
  const arrEnd = text.lastIndexOf(']');
  if (arrStart < 0 || arrEnd < 0) throw new Error('animations 数组定界失败');

  let arrText = text.slice(arrStart, arrEnd + 1);
  arrText = arrText.replace(/ExtResource\(\s*"([^"]+)"\s*\)/g, (_full, id) => {
    const p = idToPath[id];
    if (!p) throw new Error(`ExtResource("${id}") 未找到对应贴图`);
    return JSON.stringify(p);
  });
  arrText = arrText.replace(/&"/g, '"');

  const raw = JSON.parse(arrText);
  return raw.map((a) => ({
    name: a.name,
    loop: !!a.loop,
    fps: Number(a.speed) || 12,
    frames: (a.frames || []).map((f) => f.texture),
  }));
}

function convertSet(set) {
  const tresAbs = path.join(ROOT, set.tres);
  if (!fs.existsSync(tresAbs)) throw new Error(`找不到 .tres: ${set.tres}`);

  const animations = parseTres(fs.readFileSync(tresAbs, 'utf8'));
  const resBase = tresResBaseDir(set.tres);

  // 收集去重帧（按首次出现顺序）→ key=相对 .tres 目录的路径
  const order = [];
  const keyToRes = {};
  for (const anim of animations) {
    for (const resPath of anim.frames) {
      const key = resPath.startsWith(resBase + '/')
        ? resPath.slice(resBase.length + 1)
        : resPath.replace(/^res:\/\//, '');
      if (!(key in keyToRes)) {
        keyToRes[key] = resPath;
        order.push(key);
      }
    }
  }

  const animOut = {};
  for (const anim of animations) {
    if (!anim.frames.length) continue;
    const frameKeys = anim.frames.map((resPath) =>
      resPath.startsWith(resBase + '/')
        ? resPath.slice(resBase.length + 1)
        : resPath.replace(/^res:\/\//, ''),
    );
    animOut[anim.name] = { loop: anim.loop, fps: anim.fps, frames: frameKeys };
  }

  const out = writeAnimSet({
    root: ROOT,
    id: set.id,
    source: set.tres,
    blend: set.blend,
    downscale: set.downscale,
    order,
    readFrame(key) {
      const rel = resToDisk(keyToRes[key]);
      const srcAbs = path.join(ROOT, rel);
      if (!fs.existsSync(srcAbs)) throw new Error(`帧文件缺失: ${rel}`);
      return PNG.sync.read(fs.readFileSync(srcAbs));
    },
    animations: animOut,
  });

  const q = hasPngquant() ? `${out.rawKb}→${out.kb}KB` : `${out.kb}KB`;
  console.log(
    `[tres2pixi] ${set.id}: ${Object.keys(animOut).length} 动画 / ${out.frameCount} 帧 → ${out.atlasLogical} (${out.width}x${out.height}, ${q}), blend=${set.blend || 'normal'}`,
  );
}

function main() {
  for (const set of SETS) convertSet(set);
  console.log('[tres2pixi] 完成');
}

main();
