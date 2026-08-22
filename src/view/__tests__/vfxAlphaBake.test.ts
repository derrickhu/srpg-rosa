import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

/**
 * 守卫「黑底特效的 alpha 必须是按亮度烘过的渐变」。
 *
 * 为什么值得一条测试：这些图集当年是 alpha 全 255 的黑底图，完全靠 additive 让黑消失。
 * 而战场草地是 RGB(202,225,54)，绿通道已经 225/255——additive 叠上去只能往 255 推，
 * 中间调和暗部（形状与质感的全部信息）在屏幕上一起消失：赤焰的红整个不见、
 * 银白的盾墙叠成黄绿、青蓝的符印变成苍白薄荷。
 *
 * 现在形体层走普通混合，靠烘进 alpha 的亮度遮挡背景（见 `src/view/vfxBlend.ts`）。
 * 这条链的脆弱点在管线：`scripts/vfx-sheet.py --alpha-gamma 0`，或者拿旧脚本重切一次，
 * 产出的就是 alpha 全 255 的图集，而普通混合那一层会变成一个**黑方块**盖在草地上。
 * 这种回归不报错、不崩，只是画面难看，没人会当 bug 报上来，所以必须由测试盯着。
 * 修法：重跑 `python3 scripts/vfx-rebake.py && node scripts/sprite2anim.mjs`。
 */
describe('黑底特效图集的 alpha 烘制', () => {
  const ROOT = path.resolve(__dirname, '../../..');
  const ANIM_DIR = path.join(ROOT, 'src/data/anim');

  const addSets = fs
    .readdirSync(ANIM_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      id: f.replace(/\.json$/, ''),
      manifest: JSON.parse(fs.readFileSync(path.join(ANIM_DIR, f), 'utf8')) as {
        blend?: string;
        image: string;
      },
    }))
    .filter((s) => s.manifest.blend === 'add');

  it('登记了 additive 特效集合', () => {
    expect(addSets.length).toBeGreaterThan(20);
  });

  it.each(addSets.map((s) => [s.id, s.manifest.image] as const))(
    '%s 的 alpha 是渐变而不是全不透明',
    (setId, image) => {
      const png = PNG.sync.read(fs.readFileSync(path.join(ROOT, image)));
      let opaque = 0;
      let graded = 0;
      for (let i = 3; i < png.data.length; i += 4) {
        const a = png.data[i]!;
        if (a >= 250) opaque++;
        else if (a > 4) graded++;
      }
      // 有相当比例的中间 alpha 才说明亮度烘进去了；全 255 的旧图集这里会是 0。
      // 阈值放到 8%：pngquant 会把 alpha 一起量化，各集合的比例差别不小
      const ratio = graded / Math.max(graded + opaque, 1);
      expect(ratio, `${setId} 的 alpha 几乎没有过渡，像是没烘就打包了`).toBeGreaterThan(0.08);
    },
  );
});
