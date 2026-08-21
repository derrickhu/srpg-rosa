# 圣光弹体（holy_orb）—— 黑底 additive 光球 6 帧（2x3 网格，循环）

- 用途：祭司普攻飞行弹体，`vfxCatalog.ATTACK_VFX.healer.travel.glowSet='holy_orb'`。
- 运行时 loop。6 帧必须可无缝循环。
- 色相家族：**青绿**（祭司）。白热核心 → `#6EE7B7` → `#0D9488`。
- 形态：圆润光球，不是火球泪滴，不是箭，不是骑兵品红箭头环。
- 参考图：`godot/art/vfx/slash/frames/slash_02.png`，只锁辉光质感。

## Prompt

The attached reference image is ONE SINGLE VFX frame. Match its rendering style exactly: pure
black background, bright white-hot core, crisp hard-edged glowing shapes, small sparkle glints,
no soft photographic blur. It defines the STYLE ONLY, not the layout — produce the 2x3 grid.

CRITICAL BACKGROUND: PURE BLACK #000000. Every non-glow pixel is absolutely black.

A 2x3 sprite sheet (2 rows, 3 columns) showing 6 frames of a HOLY LIGHT ORB flying to the RIGHT,
seen from DIRECTLY ABOVE. LOOPING projectile: frame 6 must cut back to frame 1 without a pop.
Do NOT appear-and-dissolve. Do NOT draw a long beam.

SHAPE: a ROUND glowing ball, slightly flattened into a short oval pointing RIGHT. Fat circular
head on the right, a VERY SHORT mint halo tail on the left (shorter than the head). This is a
BALL of light, not a teardrop fireball, not a lance, not two opposing spikes, not chevron arrows.

COLOR: white-hot at the core, brilliant mint `#6EE7B7` in the mid glow, deep teal `#0D9488` at
the outer edge. Cool mint greens only. No orange, no gold slash, no cyan-blue, no purple, no
magenta, no pink, no red.

FRAME ORDER, left-to-right then top-to-bottom. The ball PULSES:
  Frame 1: resting, head about 24% of cell width, medium brightness
  Frame 2: swelling, 28%, brighter
  Frame 3: PEAK, 32%, maximum brightness
  Frame 4: still bright, 28%
  Frame 5: back toward resting, 24%
  Frame 6: dimmest of the loop, 22%, still clearly a mint orb — do not fade to black

ABSOLUTE RULES:
1. Pure black background including between cells.
2. Exactly 6 equal-size cells, 2x3. No borders, no gutters.
3. Horizontal, pointing right, vertically centered. Game rotates this sprite.
4. Stay inside each cell with a thin black margin.
5. LOOP: peak at frame 3, return toward frame 1. Do not fade to black in frame 6.
6. No character, no staff, no sun, no plus-sign, no shield, no arrow, no text, no watermark.
7. Flat 2D game VFX. No motion blur, no smoke.
