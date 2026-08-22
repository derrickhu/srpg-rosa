# 杂兵通用砸击（mook_thud）—— 黑底 additive 4 帧（2x2 网格）

- 用途：甲壳 / 盾位杂兵普攻，以及撞阵、硬化这类钝击 / 自保闪光。`mode='burst'`。
- 色相：**灰褐尘土**。不是盾卫银白星芒，也不是铁锤砸地波。
- 径向对称，短钝，更脏更简单。

## Prompt

The attached style rules are mandatory. Produce a 2x2 sprite sheet (2 rows, 2 columns) of a
DIRTY GROUND THUD impact for monster heavy hits, seen from DIRECTLY ABOVE, flat 2D sticker.

SHAPE: a small white-hot core with FOUR short blunt wedges (cross, not a six-point star) and
one thick dusty shock ring. Chunky, concussive, radial. NOT silver needles, NOT a sword slash,
NOT a clean hexagon.

COLOR: off-white core, warm ash-grey mid, dirt-brown outer ring and wedge tips. No silver-blue,
no gold, no cyan, no magenta, no green, no purple.

FRAME ORDER, left-to-right then top-to-bottom:
  Frame 1: contact. tiny core, wedges about 20% of cell, no ring yet.
  Frame 2: PEAK. core brightest, wedges about 50%, thick ring at about 35%.
  Frame 3: wedges stubby and dimmer, ring expanded to about 60% and breaking.
  Frame 4: faint broken ring arcs and a few dirt specks. Almost black.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 4 equal-size cells in a 2x2 grid. NO borders, NO dividing lines, NO gutters.
3. Keep the burst RADIALLY SYMMETRIC and centered. The game never rotates this effect.
4. Stay INSIDE the cell with a thin black margin. Nothing may cross a cell edge.
5. Brightness PEAKS at frame 2, then falls. Do NOT draw four identical frames.
6. No character, no shield, no hammer, no cracked stone texture filling the cell, no text.
