/**
 * 动画集打包：帧位图 → 图集 PNG(images/anim/<id>.png) + 清单 JSON(src/data/anim/<id>.json)。
 *
 * 清单是 TexturePacker-Hash 兼容的 frames/meta，加上每动画的 fps/loop 与整集的 blend，
 * 由 src/view/animSets.ts 交给 PIXI.Spritesheet 解析。tres2pixi(Godot 路线) 与
 * sprite2anim(generate2dsprite 路线) 都走这里，清单格式因此只有一处定义。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';

export const IMAGES_ANIM_DIR = 'images/anim';
export const MANIFEST_DIR = 'src/data/anim';
const PADDING = 2;

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * 整数倍块平均降采样（预乘 alpha，避免透明边变暗）。f<=1 原样返回。
 * 返回 { width, height, data } 形态，与 pngjs 一致。
 */
export function downscaleBlock(png, f) {
  if (!f || f <= 1) return png;
  const { width: sw, height: sh, data: src } = png;
  const dw = Math.max(1, Math.floor(sw / f));
  const dh = Math.max(1, Math.floor(sh / f));
  const out = Buffer.alloc(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    for (let dx = 0; dx < dw; dx++) {
      let spr = 0;
      let spg = 0;
      let spb = 0;
      let sa = 0;
      let n = 0;
      for (let yy = 0; yy < f; yy++) {
        const sy = dy * f + yy;
        if (sy >= sh) continue;
        for (let xx = 0; xx < f; xx++) {
          const sx = dx * f + xx;
          if (sx >= sw) continue;
          const i = (sy * sw + sx) * 4;
          const a = src[i + 3];
          spr += src[i] * a;
          spg += src[i + 1] * a;
          spb += src[i + 2] * a;
          sa += a;
          n++;
        }
      }
      const o = (dy * dw + dx) * 4;
      if (sa === 0 || n === 0) {
        out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
      } else {
        out[o] = Math.round(spr / sa);
        out[o + 1] = Math.round(spg / sa);
        out[o + 2] = Math.round(spb / sa);
        out[o + 3] = Math.round(sa / n);
      }
    }
  }
  return { width: dw, height: dh, data: out };
}

/** 水平镜像。返回 { width, height, data } 形态，与 pngjs 一致。 */
export function flipH(png) {
  const { width, height, data } = png;
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.copy(out, (y * width + (width - 1 - x)) * 4, (y * width + x) * 4, (y * width + x) * 4 + 4);
    }
  }
  return { width, height, data: out };
}

/** 计算非透明像素的包围盒；全透明返回 null */
export function alphaBBox(png) {
  const { width, height, data } = png;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] !== 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** shelf 打包：输入带 trim 尺寸的 cells，产出每个 cell 的 (x,y) 与图集尺寸 */
function shelfPack(cells) {
  const sorted = [...cells].sort((a, b) => b.h - a.h);
  const maxW = Math.max(...sorted.map((c) => c.w + PADDING * 2), 1);
  const totalArea = sorted.reduce((s, c) => s + (c.w + PADDING * 2) * (c.h + PADDING * 2), 0);
  const width = nextPow2(Math.max(maxW, Math.ceil(Math.sqrt(totalArea))));

  let x = PADDING;
  let y = PADDING;
  let shelfH = 0;
  for (const c of sorted) {
    if (x + c.w + PADDING > width) {
      y += shelfH + PADDING;
      x = PADDING;
      shelfH = 0;
    }
    c.x = x;
    c.y = y;
    x += c.w + PADDING;
    if (c.h > shelfH) shelfH = c.h;
  }
  const height = nextPow2(y + shelfH + PADDING);
  return { width, height };
}

let pngquantAvailable = null;
export function hasPngquant() {
  if (pngquantAvailable === null) {
    pngquantAvailable = spawnSync('pngquant', ['--version'], { stdio: 'ignore' }).status === 0;
  }
  return pngquantAvailable;
}

/** 可选 pngquant 有损量化（在 PATH 上才跑，否则跳过） */
export function optimizePng(absPath) {
  if (!hasPngquant()) return;
  spawnSync(
    'pngquant',
    ['--force', '--skip-if-larger', '--strip', '--quality=65-90', '--speed', '1', '--output', absPath, absPath],
    { stdio: 'ignore' },
  );
}

/**
 * 打包一个动画集并落盘。
 *
 * @param {object} spec
 * @param {string} spec.root            仓库根绝对路径
 * @param {string} spec.id              集合 id，决定图集与清单文件名
 * @param {string} spec.source          产物溯源信息，写进清单便于排查
 * @param {'normal'|'add'} [spec.blend] 'add' = 黑底发光特效
 * @param {number} [spec.downscale]     源帧整数降采样倍数（2 = 512→256）
 * @param {string[]} spec.order         帧 key，按图集收录顺序（需已去重）
 * @param {(key: string) => object} spec.readFrame  按 key 读出 pngjs PNG
 * @param {Record<string, {loop: boolean, fps: number, frames: string[]}>} spec.animations
 * @returns {{ atlasLogical: string, width: number, height: number, frameCount: number, rawKb: string, kb: string }}
 */
/** 躯干核心：距离变换达到最厚点这个比例才算「厚」，用于定头顶 */
const K_CORE = 0.45;
/** 脚线：腿比躯干窄，用逐行宽度即可，阈值取最宽行的这个比例 */
const K_FEET = 0.25;

/**
 * 两遍 chamfer(3,4) 距离变换：每个前景像素到最近背景像素的近似距离，单位是 1/3 像素。
 * 包围盒外一律视为背景。精度约 5%，对「哪里厚哪里薄」的判断绰绰有余。
 *
 * @param {Uint8Array} mask 0/1，长度 w*h
 * @returns {Int32Array} 距离场，同样长度
 */
function chamferDistance(mask, w, h) {
  const INF = 1 << 28;
  const d = new Int32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;
  const relax = (i, j, cost) => {
    const v = d[j] + cost;
    if (v < d[i]) d[i] = v;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      if (x > 0) relax(i, i - 1, 3);
      if (y > 0) relax(i, i - w, 3);
      if (x > 0 && y > 0) relax(i, i - w - 1, 4);
      if (x < w - 1 && y > 0) relax(i, i - w + 1, 4);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      if (x < w - 1) relax(i, i + 1, 3);
      if (y < h - 1) relax(i, i + w, 3);
      if (x < w - 1 && y < h - 1) relax(i, i + w + 1, 4);
      if (x > 0 && y < h - 1) relax(i, i + w - 1, 4);
    }
  }
  return d;
}

/**
 * 切出**身体**的上下沿，排除举过头顶的武器、翎羽、犄角这类道具。
 *
 * 为什么需要它：运行时按 subjectHeight 归一化，如果拿整个包围盒当身体，那么剑尖往上伸多少，
 * 身体就被等比压小多少——角色显小的锅其实在道具身上。把道具排除掉之后，道具可以自由溢出
 * 格子（棋盘没有 mask 也没有 z 排序，溢出不会被裁），美术就不必再为了"框进一格"而缩手缩脚。
 *
 * 头顶用**距离变换**定，不能用逐行宽度。逐行宽度假设「道具细、身体宽」，斜 45° 扛着的宽刃
 * 巨剑每一行都很宽，会被整段当成身体——实测剑士朝左那帧因此报 240，而同一角色朝下只有 163。
 * 距离变换测的是「能塞进多大的圆」，各向同性：再宽的刀刃也薄，头和躯干才厚，与道具角度无关。
 * 换上之后剑士全表离散度从 21% 降到 6.6%，斜剑帧与朝下帧都稳定在 163。
 *
 * 具体做法：取最厚点半径 dmax，`D >= 0.45*dmax` 的像素即躯干核心，其最高点再往上补
 * `0.45*dmax`——圆形的头被这样阈值化后正好缩进这么多，补回去就是真实头顶。
 * 脚线仍用逐行宽度，因为腿本来就细、距离变换分不出它和刀刃，而道具极少伸到脚下。
 *
 * @param {Uint8Array} mask 包围盒内的 0/1 前景掩码，长度 w*h
 * @returns {{ top: number, bottom: number }} 相对包围盒顶端的行号，bottom 为开区间
 */
export function bodySpan(mask, w, h) {
  const rowWidth = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (mask[y * w + x]) n++;
    rowWidth[y] = n;
  }
  const maxRow = Math.max(...rowWidth);

  const d = chamferDistance(mask, w, h);
  let dmax = 0;
  for (let i = 0; i < d.length; i++) if (d[i] > dmax) dmax = d[i];
  const coreThreshold = K_CORE * dmax;

  let coreTop = h;
  outer: for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[y * w + x] >= coreThreshold) {
        coreTop = y;
        break outer;
      }
    }
  }
  // 距离场是 chamfer 单位（3 = 1 像素），补回阈值化削掉的那圈
  const top = Math.max(0, Math.round(coreTop - coreThreshold / 3));

  let bottom = h;
  while (bottom > top && rowWidth[bottom - 1] < K_FEET * maxRow) bottom--;

  // 判定失灵（比如遇到没见过的形状）时退回整个包围盒，宁可显小也不要显得巨大
  if (bottom - top < 0.5 * h) return { top: 0, bottom: h };
  return { top, bottom };
}

/**
 * 量出角色在一张帧里的身体高度与站位。跨动作对齐体型、算清单 metrics 都用它，
 * 保证「什么算身体」全项目只有一个定义。
 *
 * @returns {{ bbox: object, bodyHeight: number, topY: number, feetY: number, centerX: number } | null}
 */
export function measureBody(png) {
  const bbox = alphaBBox(png);
  if (!bbox) return null;
  const span = bodySpan(bboxMask(png, bbox), bbox.w, bbox.h);
  return {
    bbox,
    bodyHeight: span.bottom - span.top,
    topY: bbox.y + span.top,
    feetY: bbox.y + span.bottom,
    centerX: bbox.x + bbox.w / 2,
  };
}

/**
 * 以 (ax, ay) 为不动点整体缩放 s 倍，画布尺寸不变。预乘 alpha 双线性采样，避免透明边发黑。
 * 用于把不同动作的体型对齐：取脚点当不动点，缩放后角色仍然站在原来的脚线上。
 */
export function resampleAbout(png, s, ax, ay) {
  const { width: w, height: h, data: src } = png;
  const out = Buffer.alloc(w * h * 4);
  const at = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    const i = (y * w + x) * 4;
    return [src[i], src[i + 1], src[i + 2], src[i + 3]];
  };
  for (let y = 0; y < h; y++) {
    const sy = ay + (y - ay) / s;
    const y0 = Math.floor(sy);
    const fy = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = ax + (x - ax) / s;
      const x0 = Math.floor(sx);
      const fx = sx - x0;
      let pr = 0;
      let pg = 0;
      let pb = 0;
      let pa = 0;
      for (const [dx, dy, wgt] of [
        [0, 0, (1 - fx) * (1 - fy)],
        [1, 0, fx * (1 - fy)],
        [0, 1, (1 - fx) * fy],
        [1, 1, fx * fy],
      ]) {
        if (wgt <= 0) continue;
        const p = at(x0 + dx, y0 + dy);
        if (!p) continue;
        const a = p[3] * wgt;
        pr += p[0] * a;
        pg += p[1] * a;
        pb += p[2] * a;
        pa += a;
      }
      const o = (y * w + x) * 4;
      if (pa <= 0) continue;
      out[o] = Math.round(pr / pa);
      out[o + 1] = Math.round(pg / pa);
      out[o + 2] = Math.round(pb / pa);
      out[o + 3] = Math.round(Math.min(255, pa));
    }
  }
  return { width: w, height: h, data: out };
}

/** 取包围盒内的前景掩码 */
function bboxMask(png, bbox) {
  const mask = new Uint8Array(bbox.w * bbox.h);
  for (let row = 0; row < bbox.h; row++) {
    const base = ((bbox.y + row) * png.width + bbox.x) * 4;
    for (let x = 0; x < bbox.w; x++) {
      if (png.data[base + x * 4 + 3] !== 0) mask[row * bbox.w + x] = 1;
    }
  }
  return mask;
}

/**
 * 角色在源帧里的实际度量，供运行时把不同来源的单位缩放到统一屏幕高度、并踩在同一条脚线上。
 *
 * 不能用源帧边长当缩放基准：各集合角色在帧里的占比差很多（sword 站立高 146/256，
 * bow 215/256），按帧框缩放等于谁画得满谁显示得大。也不能用逐帧包围盒，因为举武器的帧
 * 会把高度撑起来。所以固定取「静止参考帧」——它就是玩家在单位不动时看到的那一帧——
 * 再用 bodySpan 从中切掉道具，只留身体。
 *
 * @returns {{ frameSize: number, subjectHeight: number, baselineY: number, ref: string }}
 */
function subjectMetrics(cells, animations) {
  const refKey =
    animations.default?.frames[0] ?? animations.idle?.frames[0] ?? cells[0].key;
  const c = cells.find((x) => x.key === refKey) ?? cells[0];
  const bbox = { x: c.trimX, y: c.trimY, w: c.w, h: c.h };
  const span = bodySpan(bboxMask(c.png, bbox), bbox.w, bbox.h);
  return {
    frameSize: c.sourceH,
    /** 身体（不含道具）在源帧中的高度 */
    subjectHeight: span.bottom - span.top,
    /** 脚底在源帧中的 y */
    baselineY: c.trimY + span.bottom,
    ref: c.key,
  };
}

export function writeAnimSet(spec) {
  const { root, id, source, order, readFrame, animations } = spec;
  const blend = spec.blend || 'normal';
  const downscale = spec.downscale || 1;

  if (!order.length) throw new Error(`[${id}] 帧列表为空`);
  for (const [name, anim] of Object.entries(animations)) {
    for (const key of anim.frames) {
      if (!order.includes(key)) throw new Error(`[${id}] 动画 ${name} 引用了未收录的帧 ${key}`);
    }
  }

  const cells = order.map((key) => {
    const png = downscaleBlock(readFrame(key), downscale);
    const bbox = alphaBBox(png) || { x: 0, y: 0, w: 1, h: 1 };
    return {
      key,
      png,
      sourceW: png.width,
      sourceH: png.height,
      trimX: bbox.x,
      trimY: bbox.y,
      w: bbox.w,
      h: bbox.h,
    };
  });

  const { width, height } = shelfPack(cells);

  const atlas = new PNG({ width, height });
  atlas.data.fill(0);
  for (const c of cells) {
    for (let row = 0; row < c.h; row++) {
      const srcStart = ((c.trimY + row) * c.sourceW + c.trimX) * 4;
      const dstStart = ((c.y + row) * width + c.x) * 4;
      c.png.data.copy(atlas.data, dstStart, srcStart, srcStart + c.w * 4);
    }
  }

  const atlasLogical = `${IMAGES_ANIM_DIR}/${id}.png`;
  const atlasAbs = path.join(root, atlasLogical);
  ensureDir(path.dirname(atlasAbs));
  fs.writeFileSync(atlasAbs, PNG.sync.write(atlas));
  const rawKb = (fs.statSync(atlasAbs).size / 1024).toFixed(1);
  optimizePng(atlasAbs);

  // 改为图集后不再随包发散帧
  const oldFramesDir = path.join(root, IMAGES_ANIM_DIR, id);
  if (fs.existsSync(oldFramesDir)) fs.rmSync(oldFramesDir, { recursive: true, force: true });

  const frames = {};
  for (const c of cells) {
    frames[c.key] = {
      frame: { x: c.x, y: c.y, w: c.w, h: c.h },
      rotated: false,
      trimmed: c.w !== c.sourceW || c.h !== c.sourceH,
      spriteSourceSize: { x: c.trimX, y: c.trimY, w: c.w, h: c.h },
      sourceSize: { w: c.sourceW, h: c.sourceH },
    };
  }

  const manifest = {
    id,
    source,
    blend,
    image: atlasLogical,
    meta: { size: { w: width, h: height }, scale: '1', format: 'RGBA8888' },
    metrics: subjectMetrics(cells, animations),
    frames,
    animations,
  };

  const manifestAbs = path.join(root, MANIFEST_DIR, `${id}.json`);
  // tres2pixi 和 sprite2anim 都往这里写，集合 id 撞车的话谁后跑谁赢，而且悄无声息。
  // 靠 source 认领：换生产者必须先手动删掉旧清单，逼你确认这是有意迁移而不是重名。
  if (fs.existsSync(manifestAbs)) {
    const prev = JSON.parse(fs.readFileSync(manifestAbs, 'utf8'));
    if (prev.source && prev.source !== source) {
      throw new Error(
        `集合 id 撞车: ${id} 现属于 ${prev.source}，本次来源是 ${source}。\n` +
          `确实要换生产者就先删掉 ${MANIFEST_DIR}/${id}.json 再跑。`,
      );
    }
  }
  ensureDir(path.dirname(manifestAbs));
  fs.writeFileSync(manifestAbs, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  return {
    atlasLogical,
    width,
    height,
    frameCount: cells.length,
    rawKb,
    kb: (fs.statSync(atlasAbs).size / 1024).toFixed(1),
  };
}
