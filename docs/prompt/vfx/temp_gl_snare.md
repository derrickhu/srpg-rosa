# 野草缠足（temp_gl_snare）特效 —— 黑底 additive 藤蔓收束 9 帧（3x3 网格）

- 技能：`temp_gl_snare`（邻格选敌，减速，无伤）。
- 运行时：`SKILL_VFX.temp_gl_snare`，`anchor='target' mode='burst' cells=1.6`。
- 草原主题：翠绿藤蔓缠绕目标格，**不是**剑士金橙斩、也不是光滑冲击环。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and black
is what becomes invisible in the game.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of GRASSLAND VINE SNARE —
glowing green thorny vines constricting around a point, seen from DIRECTLY ABOVE (top-down).

SHAPE: several curved vine tendrils with small thorns, coiling inward from the edges toward the
center (lasso / snare), NOT a smooth shockwave ring, NOT a slash arc. Leave pure black gaps
between vines so silhouette reads as "plants wrapping" not "energy circle".

COLOR: white-mint core tips → bright leaf green mid → deep forest green outer.
NO gold-orange hero slash. NO blue. NO blood red. NO purple.

FRAME ORDER, left-to-right then top-to-bottom. Vines CLOSE IN:
  Frame 1: Loose open vine arcs at ~70% radius, dim.
  Frame 2: Vines denser, ~60%, brighter tips.
  Frame 3: Coil tightening ~50%, peak brightness.
  Frame 4: Tight snare ~40%, thorns readable.
  Frame 5: Very tight ~30%, bright knot at center.
  Frame 6: Knot flares, vines start to fray.
  Frame 7: Fragments of vine arcs ~45% fading.
  Frame 8: Sparse green shreds.
  Frame 9: Almost black; few dim green tip fragments.

ABSOLUTE RULES:
1. Background PURE BLACK #000000 everywhere, including between cells.
2. EXACTLY 9 equal cells in a 3x3 grid. NO borders, NO gutters, NO frames between cells.
3. Effect CENTERED in every cell — center must not drift.
4. Stay INSIDE each cell; leave thin black margin even on frame 9.
5. NO character, NO ground, NO text, NO watermark.
6. Flat 2D game VFX. NO motion blur, NO smoke clouds.
