#!/usr/bin/env node
/**
 * 从动画图集派生静态单位贴图 images/units/<兵种>.png。
 *
 * 为什么不手工维护：布阵格子、队伍卡片、战斗中的技能头像走的都是这批静态图
 * （`renderHelpers.createUnitToken` → `UNIT_BUNDLE`），和战场上的动画是两套资产。
 * 四兵种换成 AI 管线那版之后，这批图没跟着换，于是布阵界面还是旧美术、一进战斗人就变了。
 * 派生出来就不可能再脱节：改了动画重跑本脚本即可。
 *
 * 站位规则和 `AnimatedUnit` 完全一致（身体归一化到 0.92 格、脚线落在格心下方 0.2 格），
 * 差别只在这里要把结果烤进图片：`createUnitToken` 是按包围盒等比填格的，谁在图里画得满谁就
 * 显示得大，所以**四个兵种必须共用同一个裁剪框**，把比例关系烤进去、运行时原样还原。
 *
 * 裁剪框取全兵种的并集，不是每人各切各的，也不是对称方图：剑士的巨剑向上探出 1.10 格而脚下
 * 只要 0.21 格，对称留边会白扔掉半张图，把角色压到只剩四成高。
 *
 * 用法：node scripts/anim2token.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { optimizePng } from './lib/animAtlas.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = 'images/units';
/** 输出高度，沿用旧 token 的 128px */
const TOKEN_HEIGHT = 128;
/** 在实测最大道具溢出之外再留的余量，防止抗锯齿边被切 */
const PAD_MARGIN = 1.03;

/** 与 AnimatedUnit.ts 保持一致，改那边这里要跟着改 */
const UNIT_HEIGHT_CELLS = 0.92;
const MOOK_HEIGHT_CELLS = 0.7;
const FEET_BELOW_CENTER = 0.2;
// 与 animSets.ts 的 MOOK_ART_SETS 同步。判据是**剪影形态**（非人形、宽块状），
// 不是「是不是杂兵」——第三章守军是人形兽人，按英雄身高走，刻意不在这里。
const MOOK_SETS = new Set([
  'slime', 'sporecap', 'bloodwolf', 'rockshell',
  'vinecocoon', 'sporesac', 'leafpanther', 'mosswarden',
  'mirehand', 'dartbug', 'miregator', 'mudcarapace',
  'magmacore', 'emberbat', 'scalewyrm', 'ashshell',
]);

/**
 * 要派生 token 的集合。前四个是 UnitKind（与 src/battle/types.ts 一致），
 * 后接第一章杂兵 + 精英/Boss 的专属外观（stagesMvp 的 animSet），布阵格预览敌方阵容要用。
 * 漏掉的话 `createUnitToken` 找不到贴图，那格只剩阵营色圆——精英/Boss 尤其扎眼。
 *
 * 敌我必须在同一个裁剪框里出图：布阵格里两边并排站，各切各的框就没法比大小了。
 * 杂兵按 MOOK_HEIGHT 烤进去——同框里人矮一截，运行时按高度撑满时自然就是小怪体型。
 */
const TOKEN_SETS = [
  'sword', 'bow', 'shield', 'cavalry', 'mage', 'healer',
  // 第一章杂兵
  'slime', 'sporecap', 'bloodwolf', 'rockshell',
  // 第二章杂兵
  'vinecocoon', 'sporesac', 'leafpanther', 'mosswarden',
  // 第三章杂兵：人形兽人守军，**不在 MOOK_SETS 里**（按英雄身高，理由见 animSets.ts）
  'fangtrooper', 'wallbalist', 'wallrider', 'gatewarden',
  // 第四章杂兵
  'mirehand', 'dartbug', 'miregator', 'mudcarapace',
  // 第五章杂兵
  'magmacore', 'emberbat', 'scalewyrm', 'ashshell',
  // 第二至五章精英：血牙部族人形兽人，**不在 MOOK_SETS 里**（按英雄身高）
  'torun', 'castellan', 'mirespeaker', 'drakekin',
  // Boss：完整图集档位，token 从行走的第一帧派生
  'bloodfang', 'bloodshaman', 'bloodcastellan', 'mirequeen', 'drakelord',
];

function loadSet(id) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/anim', `${id}.json`), 'utf8'));
  const atlas = PNG.sync.read(fs.readFileSync(path.join(ROOT, manifest.image)));
  // 静止正面帧：和清单 metrics 取参考帧的规则一致
  const key =
    manifest.animations.default?.frames[0] ??
    manifest.animations.idle_down?.frames[0] ??
    manifest.animations.walk_down?.frames[0];
  if (!key) throw new Error(`[${id}] 找不到静止正面帧`);
  return { id, manifest, atlas, entry: manifest.frames[key], key };
}

/**
 * 算出这一帧在「虚拟格边长 = 1」时相对格心的绘制矩形。
 * 复刻 AnimatedUnit 的两步：按身体高度缩放，再按脚线把 sprite 挪到站立位置。
 */
function placeUnit({ id, manifest, entry }) {
  const m = manifest.metrics;
  const f = entry.frame;
  const sss = entry.spriteSourceSize;
  const ss = entry.sourceSize;
  const heightCells = MOOK_SETS.has(id) ? MOOK_HEIGHT_CELLS : UNIT_HEIGHT_CELLS;
  const s = heightCells / m.subjectHeight;
  // 源帧中心在格坐标里的位置（格心为原点）
  const cy = FEET_BELOW_CENTER - (m.baselineY - m.frameSize / 2) * s;
  return {
    s,
    x0: (sss.x - ss.w / 2) * s,
    y0: cy + (sss.y - ss.h / 2) * s,
    w: f.w * s,
    h: f.h * s,
  };
}

/** 预乘 alpha 双线性缩放，避免透明边发黑 */
function resampleRegion(src, sx, sy, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const fy = ((y + 0.5) * sh) / dh - 0.5;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = ((x + 0.5) * sw) / dw - 0.5;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      let pr = 0;
      let pg = 0;
      let pb = 0;
      let pa = 0;
      for (const [ox, oy, wgt] of [
        [0, 0, (1 - tx) * (1 - ty)],
        [1, 0, tx * (1 - ty)],
        [0, 1, (1 - tx) * ty],
        [1, 1, tx * ty],
      ]) {
        if (wgt <= 0) continue;
        const px = Math.min(sw - 1, Math.max(0, x0 + ox));
        const py = Math.min(sh - 1, Math.max(0, y0 + oy));
        const i = ((sy + py) * src.width + sx + px) * 4;
        const a = src.data[i + 3] * wgt;
        pr += src.data[i] * a;
        pg += src.data[i + 1] * a;
        pb += src.data[i + 2] * a;
        pa += a;
      }
      const o = (y * dw + x) * 4;
      if (pa <= 0) continue;
      out[o] = Math.round(pr / pa);
      out[o + 1] = Math.round(pg / pa);
      out[o + 2] = Math.round(pb / pa);
      out[o + 3] = Math.round(Math.min(255, pa));
    }
  }
  return { width: dw, height: dh, data: out };
}

function main() {
  const sets = TOKEN_SETS.map(loadSet);
  const placed = sets.map((set) => ({ set, box: placeUnit(set) }));

  // 全兵种共用一个裁剪框（格坐标，格心为原点）。各切各的会让 token 之间大小不一致，
  // 正是这次要修的问题。
  const crop = { l: 0, r: 0, t: 0, b: 0 };
  for (const { box } of placed) {
    crop.l = Math.max(crop.l, -box.x0);
    crop.r = Math.max(crop.r, box.x0 + box.w);
    crop.t = Math.max(crop.t, -box.y0);
    crop.b = Math.max(crop.b, box.y0 + box.h);
  }
  for (const k of ['l', 'r', 't', 'b']) crop[k] *= PAD_MARGIN;

  const cellsH = crop.t + crop.b;
  const cellsW = crop.l + crop.r;
  const px = TOKEN_HEIGHT / cellsH;
  const outW = Math.round(cellsW * px);
  console.log(
    `[anim2token] 共用裁剪框 ${cellsW.toFixed(2)}x${cellsH.toFixed(2)} 格 → ${outW}x${TOKEN_HEIGHT}px，` +
      `身体占图高 ${((UNIT_HEIGHT_CELLS / cellsH) * 100).toFixed(0)}%`,
  );

  fs.mkdirSync(path.join(ROOT, OUT_DIR), { recursive: true });
  for (const { set, box } of placed) {
    const png = new PNG({ width: outW, height: TOKEN_HEIGHT });
    png.data.fill(0);

    const dw = Math.max(1, Math.round(box.w * px));
    const dh = Math.max(1, Math.round(box.h * px));
    const f = set.entry.frame;
    const img = resampleRegion(set.atlas, f.x, f.y, f.w, f.h, dw, dh);
    // 裁剪框左上角在格坐标里是 (-crop.l, -crop.t)
    const dx = Math.round((box.x0 + crop.l) * px);
    const dy = Math.round((box.y0 + crop.t) * px);
    for (let y = 0; y < dh; y++) {
      const ty = dy + y;
      if (ty < 0 || ty >= TOKEN_HEIGHT) continue;
      for (let x = 0; x < dw; x++) {
        const tx = dx + x;
        if (tx < 0 || tx >= outW) continue;
        const si = (y * dw + x) * 4;
        if (img.data[si + 3] === 0) continue;
        png.data.set(img.data.subarray(si, si + 4), (ty * outW + tx) * 4);
      }
    }

    const abs = path.join(ROOT, OUT_DIR, `${set.id}.png`);
    fs.writeFileSync(abs, PNG.sync.write(png));
    optimizePng(abs);
    console.log(
      `[anim2token] ${set.id} ← ${set.manifest.id}/${set.key}  ` +
        `${outW}x${TOKEN_HEIGHT}, ${(fs.statSync(abs).size / 1024).toFixed(1)}KB`,
    );
  }
}

main();
