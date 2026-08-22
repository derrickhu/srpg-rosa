# 杂兵通用近战抓挠（mook_claw）—— 黑底 additive 4 帧（2x2 网格）

- 用途：非人形杂兵近战普攻命中，以及撕咬 / 冲撞类杂兵技能。`mode='aimed'`。
- 色相：**骨白芯 + 锈褐沿**。刻意不走剑士金橙——玩家刀光是利刃月牙，杂兵是爪子刮过。
- 比玩家 `sword_swing` / `slash` 更短、更糙、帧更少。

## Prompt

The attached style rules are mandatory. Produce a 2x2 sprite sheet (2 rows, 2 columns) of a
CRUDE CLAW SCRATCH hit flash for monster attacks, seen as a flat 2D sticker.

SHAPE: three short parallel claw marks, like animal nails raking from upper-left toward
lower-right. Thick, slightly irregular strokes — NOT a clean sword crescent, NOT a blade with
a hilt, NOT a moon-arc. White-hot core along the middle of each scratch, rusty-brown outer
edge. A few chunky sparks at the leading tips only.

COLOR: brilliant white core, bone-ivory mid, rusty umber brown rim. No gold, no cyan, no
magenta, no silver-blue, no green, no purple.

FRAME ORDER, left-to-right then top-to-bottom:
  Frame 1: scratches just appearing, about 25% of cell width, very bright thin marks.
  Frame 2: PEAK. three full scratches about 55% of cell width, brightest white cores,
           small sparks at the tips.
  Frame 3: marks breaking into short shards, dimmer, rust rim more visible.
  Frame 4: a few faint rusty specks and one broken scratch remnant. Almost black.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 4 equal-size cells in a 2x2 grid. NO borders, NO dividing lines, NO gutters.
3. The scratches stay centered in each cell and point the same way in all 4 frames.
4. Stay INSIDE the cell with a thin black margin. Nothing may cross a cell edge.
5. Brightness PEAKS at frame 2, then falls. Do NOT draw four identical frames.
6. No character, no paw, no monster body, no weapon silhouette, no text, no watermark.
