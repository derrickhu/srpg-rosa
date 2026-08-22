# 腐沼瘟息（mirequeen_miasma）特效 —— 黑底 additive 低伏沉雾 9 帧（3x3 网格）

- 技能皮肤：`enemySkillCatalog` `mirequeen_miasma` → 底层 `swamp_miasma`
  （`discAoE radius:2` + 群体 `poison` 4/回合 ×3 回合）。
- 运行时：`vfxCatalog.ts` 的 `SKILL_VFX.mirequeen_miasma`，`anchor='caster' mode='burst'`。
  半径 2 的圆盘直径是 5 格，所以 `cells` 要给到 4.4——比前四个 Boss 都大。
- 技能类标准：9 帧 @20fps（见 §4.2）。

## 形态选择（§4.4 形态不能重复）

前四个 Boss 招式已经占掉四个方向：`bloodfang_roar` 向外扩散（环）、
`bloodfang_wildfire` 向上窜（柱）、`bloodfang_breach` 向前推（线）、
`drake_cataclysm` 从一点张开（锥）。

这一招走**向下沉**：一片浊雾贴着地面漫开，然后**往下压实**。它和「环」的区别不在半径
而在**重量**——环是一道向外跑的边，沉雾是一整片填实的低雾，边缘是钝的、往下垂的。
和「柱」正好是同一根轴的反方向。

这个形态和机制是同一句话：这一章的地形本身就在削你（沼泽每回合 −5），
而这一招把「脚下的东西在害你」放大了一遍。

## 配色

**必须是绿的。** 瘟疫/毒在通用美术语言里几乎总画成紫色，而紫是本项目的硬禁
（§1.3，且紫贴近抠色键）。这里走脓黄绿：亮酸黄绿 → 脓黄绿 → 暗苔绿，
暗色压在雾的下沿，让它看起来是**沉的**而不是飘的。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog filling the cell, no glow bleeding into the corners. This is an additive blend
effect and black is what becomes invisible in the game.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of a LOW BANK OF PLAGUE MIASMA settling
over the ground, seen from a slightly raised three-quarter view.

SHAPE: a WIDE, FLAT, LOW disc of heavy fog lying ON the ground, made of four or five thick
overlapping rounded lobes with BLUNT edges. It is much WIDER than it is TALL and it must read as
HEAVY and SINKING — pressing down and spreading outward along the floor, never rising, never
billowing upward. Along its outer edge, short fat blunt tongues of fog sag DOWNWARD.

It must NOT be an expanding thin ring, NOT a rim, NOT a smooth circle outline, NOT a mushroom
cloud, NOT a vertical pillar, NOT a ball, NOT a cone, NOT a spiked sawblade. The interior is
FILLED with fog, not empty — this is the one effect in the set that is a solid low mass rather
than an outward-travelling edge.

COLOR: bright ACID YELLOW-GREEN (#CFE05A) in the brightest upper surfaces of the fog, PUS
YELLOW-GREEN (#A8BC3A) through the body, and DARK MOSS GREEN (#3D5220) along the bottom edge and
in the sagging tongues so the mass reads as heavy and low. ABSOLUTELY NO PURPLE, NO VIOLET, NO
PINK, NO MAGENTA — plague is usually drawn purple and that is exactly the mistake to avoid. NO
blue, NO orange, NO red.

FRAME ORDER, left-to-right then top-to-bottom. The fog ERUPTS low, floods outward across the
ground, then thins and settles. Disc WIDTH as a percentage of cell width:

  Frame 1: a small dense knot of fog bursting at ground level, width ~20%, very bright,
           already flat and wide rather than tall.
  Frame 2: width ~45%, spreading low and fast, PEAK BRIGHTNESS.
  Frame 3: width ~68%, clearly a flat filled disc now, sagging tongues appearing at the edge.
  Frame 4: width ~85%, widest and heaviest, thickest sagging tongues, interior fully filled.
  Frame 5: width ~90%, still full but dimming, the acid highlights fading first.
  Frame 6: width ~90%, noticeably dimmer and thinner, dark moss green now dominant.
  Frame 7: width ~85%, breaking into separate low patches with black gaps between them.
  Frame 8: width ~75%, only a few dim dark-green patches hugging the ground.
  Frame 9: almost black; a few faint dark-green smudges at the ground line.

ABSOLUTE RULES:
1. Background PURE BLACK #000000 everywhere, including between cells.
2. EXACTLY 9 equal cells in a 3x3 grid. NO borders, NO gutters, NO frames between cells.
3. Effect CENTERED in every cell and sitting LOW in it — the mass grows outward sideways, it
   must not drift and must not climb upward out of the lower half.
4. Stay INSIDE each cell; leave a thin black margin even on the widest frame.
5. NO character, NO body, NO creature, NO skull, NO face, NO bones, NO insects, NO weapon,
   NO ground texture, NO grass, NO trees, NO text, NO watermark.
6. Flat 2D game VFX. NO motion blur, NO photographic depth of field, NO soft haze filling the cell.
7. NO outlines — effects are light, not stickers (§4.7).
8. Brightness must clearly PEAK at frame 2 and then fall off monotonically to frame 9.
