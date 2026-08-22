import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ATTACK_VFX, SKILL_VFX } from '@/data/vfxCatalog';
import type { VfxRecipe } from '@/data/vfxCatalog';

/**
 * 守卫「普通混合的特效不许把单位盖住」。
 *
 * 这条约束在 additive 时代不存在：additive 只加不减，一张图再大再实也挡不住人。
 * 这一轮把一批实体零件（藤、草、树皮、蜜蜂、铁钩）从 additive 改成抠图 + 普通混合
 * 之后，「不透明」第一次成了真的——而没人想到要验，于是同一个坑连着踩了三次：
 *
 *   - 野草缠足画成一丛密草，把中招的敌人整个糊住（单位区遮挡 71%）。
 *   - 树皮庇护画成一圈闭合的桶，前壁比人高，`cells` 缩到 0.95 仍糊住胸口（73%）。
 *   - 同一张按「甜甜圈中心留空」重画，但环带透视——洞在上半、前壁在下半，
 *     几何中心照样压在前壁上，还是 73%。
 *
 * 三次的共同教训：**别指望用 `alpha` 或 `cells` 去救构图**，得把零件挪出人站的位置。
 * 缠足改成项圈（中心留空）降到 24%，树皮改成左右夹合（中间留竖缝）降到 32%。
 *
 * 为什么必须由测试盯着：这种回归不报错、不崩，跑起来只是「放了个技能，人不见了」，
 * 而增益技能把受益者遮住恰恰让这一招唯一要传达的信息（谁被保护了）归零。
 */
describe('普通混合特效对单位的遮挡', () => {
  const ROOT = path.resolve(__dirname, '../../..');
  const ANIM_DIR = path.join(ROOT, 'src/data/anim');
  /** 与 src/view/AnimatedUnit.ts 的 UNIT_HEIGHT_CELLS 一致 */
  const UNIT_HEIGHT_CELLS = 0.92;
  /** 角色贴图大致的宽高比，用来框出「人占的那块」 */
  const UNIT_ASPECT = 0.72;

  type Box = { x: number; y: number; w: number; h: number };
  type Manifest = {
    blend?: string;
    image: string;
    frames: Record<
      string,
      { frame: Box; spriteSourceSize?: Box; sourceSize?: { w: number; h: number } }
    >;
    animations: Record<string, { frames: string[] }>;
  };

  const manifest = (id: string): Manifest | null => {
    const p = path.join(ANIM_DIR, `${id}.json`);
    return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as Manifest) : null;
  };

  /** 所有「普通混合 + 落在单位身上」的命中图，连带它配方里的尺寸 */
  const cases: { label: string; set: string; cells: number; alpha: number }[] = [];
  for (const [label, recipe] of [
    ...Object.entries(ATTACK_VFX).map(([k, v]) => [`attack/${k}`, v] as const),
    ...Object.entries(SKILL_VFX).map(([k, v]) => [`skill/${k}`, v] as const),
  ] as [string, VfxRecipe][]) {
    const flash = recipe.impact;
    if (!flash?.set) continue;
    const m = manifest(flash.set);
    if (!m || m.blend === 'add') continue;
    cases.push({ label, set: flash.set, cells: flash.cells ?? 1, alpha: flash.alpha ?? 1 });
  }

  /**
   * 逐帧算「人占的那块矩形里，被特效不透明像素盖掉的比例」。
   *
   * 坐标系要在**未裁剪的原始格**（`sourceSize`，256×256）里算，而不是在图集里
   * 那块裁紧的 `frame` 里算。图集是逐帧裁掉透明边的（`trimmed: true`），
   * 但它同时记了 `spriteSourceSize`，而 Pixi 的 `Texture.width` 返回的是
   * `orig`（未裁剪尺寸）、绘制时也会按 trim 把墨迹放回原位。所以
   * `playFxAnimation` 里 `sizePx / textures[0].width` 对每帧都是同一个比例，
   * `cells` 表示的就是原始格的边长——非对称构图（比如只占左三分之一的飞爪）
   * 不会被逐帧重新居心。
   *
   * 这一点值得写下来，因为只看 `frame.w` 会得出完全相反的结论：各帧 `frame.w`
   * 从 35 到 256 都有，看着像是「整段动画按首帧墨迹缩放、胀了好几倍」。
   *
   * 量的是面积加权的 alpha，半透明按比例计入——`alpha: 0.5` 的图挡一半。
   */
  function occlusionPerFrame(set: string, cells: number, alpha: number): number[] {
    const m = manifest(set)!;
    const names = m.animations[set]?.frames;
    if (!names || names.length === 0) return [];
    const png = PNG.sync.read(fs.readFileSync(path.join(ROOT, m.image)));

    return names.map((name) => {
      const entry = m.frames[name]!;
      const box = entry.frame;
      const src = entry.sourceSize ?? { w: box.w, h: box.h };
      const off = entry.spriteSourceSize ?? { x: 0, y: 0, w: box.w, h: box.h };
      // 单位和特效都锚在格心，所以单位矩形在原始格里居中
      const unitH = (UNIT_HEIGHT_CELLS * src.h) / cells;
      const unitW = unitH * UNIT_ASPECT;
      const top = (src.h - unitH) / 2;
      const left = (src.w - unitW) / 2;

      let covered = 0;
      let total = 0;
      for (let sy = Math.round(top); sy < Math.round(top + unitH); sy++) {
        for (let sx = Math.round(left); sx < Math.round(left + unitW); sx++) {
          total++;
          // 原始格坐标 → 这一帧的墨迹坐标；落在墨迹外就是透明的，不遮挡
          const iy = sy - off.y;
          const ix = sx - off.x;
          if (ix < 0 || ix >= box.w || iy < 0 || iy >= box.h) continue;
          covered += (png.data[((box.y + iy) * png.width + (box.x + ix)) * 4 + 3]! / 255) * alpha;
        }
      }
      return total === 0 ? 0 : covered / total;
    });
  }

  it('扫到了普通混合的命中图', () => {
    expect(cases.length).toBeGreaterThan(3);
  });

  it.each(cases.map((c) => [c.label, c.set, c.cells, c.alpha] as const))(
    '%s 的 %s 不会把单位盖住',
    (label, set, cells, alpha) => {
      const per = occlusionPerFrame(set, cells, alpha);
      expect(per.length, `${set} 没取到帧`).toBeGreaterThan(0);
      // 按**时间**取均值而不是取最重的一帧：起爆那一帧糊住人是正常的打击感，
      // 一帧只有 40–50ms，看不出来；真正的毛病是整段都糊着，人从头到尾不见。
      const mean = per.reduce((a, b) => a + b, 0) / per.length;
      expect(
        mean,
        `${label} 的 ${set} 全程平均遮住了单位的 ${(mean * 100).toFixed(0)}%（上限 40%），` +
          `逐帧 ${per.map((r) => `${(r * 100).toFixed(0)}%`).join(' ')}。` +
          `别调 alpha 或 cells，那救不了构图——把零件挪出人站的位置：` +
          `中心留空、或者只画左右两侧、或者只占左三分之一`,
      ).toBeLessThan(0.4);
    },
  );
});
