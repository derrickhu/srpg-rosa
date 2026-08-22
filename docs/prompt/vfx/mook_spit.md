# 杂兵通用喷吐弹体（mook_spit）—— 黑底 additive 4 帧（2x2 网格）

- 用途：杂兵远程普攻和吹箭 / 吐息的飞行段，`glowSet` + `noRotate`。
- 色相：**污赭**（脓黄芯 + 褐沿）。不是弓手青蓝箭，也不是法师赤焰火球。
- 团状，没有尖端朝向——转了反而认不出。

## Prompt

The attached style rules are mandatory. Produce a 2x2 sprite sheet (2 rows, 2 columns) of a
UGLY SPIT BLOB projectile for monster ranged attacks, flat 2D sticker.

SHAPE: a lumpy oval gob of energy, slightly wider than tall, like a spit wad or spore glob.
Tiny brilliant white core, thick ochre body, dark brown knobby rim. One short drippy tail on
the left only — not a comet, not a fireball, not an arrow. No hard point, no wings.

COLOR: white-hot pin core, dirty ochre / pus-yellow body, walnut-brown rim. No cyan, no
gold blade color, no magenta, no mint, no saturated fire-red, no purple.

FRAME ORDER, left-to-right then top-to-bottom. This is a LOOPABLE wobble, not an explosion:
  Frame 1: compact blob, tail short, core bright.
  Frame 2: blob slightly fatter, tail a bit longer, still centered.
  Frame 3: blob a little taller, tail shorter again, core pulsing.
  Frame 4: back toward compact, small extra droplet below the rim.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 4 equal-size cells in a 2x2 grid. NO borders, NO dividing lines, NO gutters.
3. The blob stays at the exact center of its cell in all 4 frames. Same facing.
4. Stay INSIDE the cell with a thin black margin. Nothing may cross a cell edge.
5. Size change is small (wobble, not explode). Do NOT draw four identical frames.
6. No character, no mouth, no insect, no arrow, no text, no watermark.
