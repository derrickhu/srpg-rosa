# 松脂火把（temp_fo_torch）—— 黑底 additive 四簇火 9 帧（3x3 网格）

- 技能：`temp_fo_torch`（十字四格点火）。
- 运行时：`SKILL_VFX.temp_fo_torch`，`anchor='caster' mode='burst'`；配方另挂 `prop_torch` 道具。
- 切帧：`python3 scripts/vfx-sheet.py --key black --align center --alpha-gamma 2.0`。
- 图集：`blend: 'add'`。

## 为什么这张留在 additive

这一轮把六套「实体零件」从 additive 改成了抠图，但火留下了：火**就是光**，
它在草地上的可辨识度量下来是 13%，本来就不吃亏——因为火是暖橙红，和黄绿草地有色相差。
出问题的是绿色系的植物零件，不是这里。

形态上要守住的是「四簇分离的火」而不是一圈火环：技能打的是十字四格，
特效必须画得出那四个格子，中心留空还兼顾了让施法者自己看得见。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is not
part of the fire must be absolutely black. No dark grey, no navy, no gradient, no vignette, no smoke,
no glow bleeding into the corners. This is an additive blend effect and black is what becomes
invisible in the game.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of FOUR SEPARATE FIRE CLUSTERS arranged in a
PLUS / CROSS pattern (up, down, left, right) around an EMPTY BLACK CENTER, seen from DIRECTLY ABOVE
(top-down).

SHAPE: four distinct clumps of licking flame, one per arm of the cross, each with a bright core and
ragged tapering tongues. The four clusters must NEVER merge into a ring or a disc — keep clear pure
black gaps between them, and keep the exact center pure black in every frame. NOT a ring, NOT a
shockwave, NOT an explosion ball.

COLOR: white-hot core → saturated orange mid → deep ember red at the tips, plus a few flying sparks.
NO green. NO blue. NO purple. NO magenta.

FRAME ORDER, left-to-right then top-to-bottom. Fire IGNITES then BURNS DOWN:
  Frame 1: Four small dim embers, one per arm.
  Frame 2: Each ember grows a small flame tongue.
  Frame 3: Flames taller, brighter, cores appearing.
  Frame 4: Peak height and brightness, tongues licking outward.
  Frame 5: Still peak, tongues bent slightly differently (flicker, not growth).
  Frame 6: Flames start collapsing, sparks fly off.
  Frame 7: Low guttering flames, more sparks than flame.
  Frame 8: Four dim embers with wisps.
  Frame 9: Four faint dark-red dots, nearly black.

ABSOLUTE RULES:
1. Background PURE BLACK #000000 everywhere, including between cells and at the cross center.
2. EXACTLY 9 equal cells in a 3x3 grid. NO borders, NO gutters, NO frames between cells.
3. The cross pattern CENTERED in every cell — must not drift between frames.
4. Stay INSIDE each cell; leave a thin black margin even on frame 4.
5. NO character, NO torch prop, NO ground, NO text, NO watermark.
6. Flat 2D game VFX. NO photographic smoke, NO motion blur.
