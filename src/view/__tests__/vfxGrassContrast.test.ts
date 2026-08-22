import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

/**
 * 守卫「特效在战场草地上看得见」。
 *
 * 这条测试要拦的东西在代码里、在配方里、在单看帧图的时候**全都看不出来**。
 * 战场草地是 RGB(202,225,54)，亮度 199——很亮，而且绿通道已经 225/255。
 * 一张亮绿色的特效帧单独看很漂亮，叠到这个底色上形状会整片消失。
 *
 * 这不是假想的风险，是已经上线过的 bug。第一轮量下来，「自身像素中与草地
 * 色差 <60（曼哈顿）的比例」是这样的：
 *
 *   野草缠足 64% / 树皮庇护 63% / 荆棘绞缠 53% / 蜂群命中 52% / 守林人 50%
 *
 * 也就是说这几招放出来，一半以上的画面等于没画。而它们全都是**绿色系走 additive**：
 * additive 管线按亮度烘 alpha，暗部一律变透明，所以这条路只有亮部能显示，
 * 而亮的绿正好和草地重合。修法不是「画亮一点」（那正是玩家抱怨的太亮），
 * 是把这些零件改走抠图 + 普通混合，让**深色实体**去和亮草地拉明度差。
 * 改完同一指标降到 1–4%。
 *
 * 阈值取 0.45。发光类零件天生有一部分像素接近草地亮度（`flame_ring` 17%、
 * `temp_ft_ram` 28%），所以不能定得太紧；而被修掉的那一类是 50% 以上。
 * 留在 35–41% 的 `bash_hit` 和 `quake` 是角色技能、这一轮没动，记在这里备查：
 * 它们偏washed 但形状仍读得出，真要改是另一轮的事，不该由这条守卫顺手判死。
 *
 * 顺带一条：这把尺子第一次跑就抓出榜首是 `temp_gl_horn`（58%），而它正是玩家点名说
 * 「比较有特点」的那一招。查下去发现原因不是它washed，是**那套图集根本没被任何配方引用**——
 * 号角的配方只有起手和 `prop_horn` 道具，9 帧图集白下载 60KB 从没画过。已经摘掉登记。
 * 结论反过来印证了这一轮的做法：号角好认是因为有一个**能叫出名字的实体道具**，
 * 不是因为有一圈光。光washed 时补道具比把光调亮有效，也不会撞上「太亮」那条抱怨。
 */
describe('特效在草地上的可辨识度', () => {
  const ROOT = path.resolve(__dirname, '../../..');
  const ANIM_DIR = path.join(ROOT, 'src/data/anim');
  const GRASS = [202, 225, 54] as const;
  // 与 src/view/vfxBlend.ts 保持一致
  const BODY_ALPHA = 0.9;
  const CORE_GAIN = 0.5;

  type Manifest = {
    blend?: string;
    image: string;
    frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
    animations: Record<string, { frames: string[] }>;
  };

  const sets = fs
    .readdirSync(ANIM_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      id: f.replace(/\.json$/, ''),
      m: JSON.parse(fs.readFileSync(path.join(ANIM_DIR, f), 'utf8')) as Manifest,
    }))
    // 只查特效集合：角色/怪物贴图不叠在草地上判读，它们有自己的轮廓和描边
    .filter((s) => s.m.animations[s.id] !== undefined);

  /**
   * 取一帧，按运行时的混合数学叠到草地上，返回「隐形像素占自身像素的比例」。
   *
   * 两段式（additive）和普通混合分开算，和 `playFxAnimation` 的分支一致。
   */
  function weakRatio(setId: string, m: Manifest, frameIdx: number): number | null {
    const names = m.animations[setId]!.frames;
    const name = names[Math.min(frameIdx, names.length - 1)]!;
    const box = m.frames[name]?.frame;
    if (!box) return null;
    const png = PNG.sync.read(fs.readFileSync(path.join(ROOT, m.image)));
    const isAdd = m.blend === 'add';
    let ink = 0;
    let weak = 0;
    for (let y = box.y; y < box.y + box.h; y++) {
      for (let x = box.x; x < box.x + box.w; x++) {
        const i = (y * png.width + x) * 4;
        const a = png.data[i + 3]! / 255;
        if (a <= 0.08) continue;
        ink++;
        let diff = 0;
        for (let c = 0; c < 3; c++) {
          const src = png.data[i + c]!;
          const bg = GRASS[c]!;
          const out = isAdd
            ? Math.min(255, bg * (1 - a * BODY_ALPHA) + src * a * BODY_ALPHA + src * a * CORE_GAIN)
            : bg * (1 - a) + src * a;
          diff += Math.abs(out - bg);
        }
        if (diff < 60) weak++;
      }
    }
    return ink === 0 ? null : weak / ink;
  }

  it('扫到了特效集合', () => {
    expect(sets.length).toBeGreaterThan(20);
  });

  it.each(sets.map((s) => [s.id] as const))('%s 在草地上读得出形状', (setId) => {
    const m = sets.find((s) => s.id === setId)!.m;
    // 取起峰附近最好的一帧。6–9 帧的老片峰值在 2–4；杂兵四件套只有 4 帧，
    // 峰值在 1，硬拿 2/3/4 等于在用淡出尾帧判可见度。
    const n = m.animations[setId]!.frames.length;
    const window = n <= 4 ? [0, 1, 2] : [2, 3, 4];
    const ratios = window
      .map((i) => weakRatio(setId, m, i))
      .filter((r): r is number => r !== null);
    expect(ratios.length, `${setId} 没取到帧`).toBeGreaterThan(0);
    const best = Math.min(...ratios);
    expect(
      best,
      `${setId} 起峰帧有 ${(best * 100).toFixed(0)}% 的像素在草地上看不出来（上限 45%）。` +
        `绿色系走 additive 必然踩这个坑：改走抠图 + 普通混合让深色实体去拉明度差，` +
        `或者按号角那条路子补一个不透明道具进配方`,
    ).toBeLessThan(0.45);
  });
});
