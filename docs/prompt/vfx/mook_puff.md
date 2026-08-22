# 杂兵通用喷散（mook_puff）—— 黑底 additive 4 帧（2x2 网格）

- 用途：杂兵远程命中句号，以及孢子喷散 / 熔岩爆裂这类自身 AoE。`mode='burst'`。
- 色相：**尘雾橄榄**。不是旋风刃环，也不是炎环扩散波。
- 不规则碎屑团，读成「喷出来一摊」，不是「绕身一圈刃」。

## Prompt

The attached style rules are mandatory. Produce a 2x2 sprite sheet (2 rows, 2 columns) of a
MESSY SPORE / DUST PUFF burst for monster area attacks, seen from DIRECTLY ABOVE, flat 2D sticker.

SHAPE: a loose cloud of 8-12 irregular glowing motes and two or three soft blobs around a
small white core. Uneven, organic, slightly clumpy. NOT a clean ring of blades, NOT a perfect
circle shockwave, NOT fire tongues, NOT a star burst.

COLOR: pale ivory core, dusty olive-yellow motes, muted brown-green rims. No gold sword color,
no cyan, no magenta, no silver, no saturated fire-red, no purple.

FRAME ORDER, left-to-right then top-to-bottom:
  Frame 1: motes close to the core, about 25% of cell, bright.
  Frame 2: PEAK. motes spread to about 50%, core brightest, a couple of larger clumps.
  Frame 3: motes farther (about 65%), dimmer, clumps breaking apart.
  Frame 4: a few faint specks near the edge. Almost black.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 4 equal-size cells in a 2x2 grid. NO borders, NO dividing lines, NO gutters.
3. Keep the puff roughly centered. Do not drift to one corner.
4. Stay INSIDE the cell with a thin black margin. Nothing may cross a cell edge.
5. Brightness PEAKS at frame 2, then falls. Do NOT draw four identical frames.
6. No character, no mushroom, no leaf, no text, no watermark.
