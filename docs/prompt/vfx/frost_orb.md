# 霜弹弹体（frost_orb）—— 黑底 additive 冰球 6 帧（2x3 网格，循环）

- 用途：芙洛普攻飞行弹体，`vfxCatalog` 的 `FLOE_ATTACK_VFX.travel.glowSet='frost_orb'`。
- 运行时 `vfxProjectile` 会 **loop** 这段动画，所以 6 帧必须是可无缝循环的脉动，不是出现→消失。
- 色相家族：**霜冰**（芙洛）。白核 → `#A8D4FF` → `#3A7AB8`。
  形态是朝右的泪滴冰晶，不是斩击、不是贯穿光束。禁止火橙、禁止紫。
- `noRotate` 不要开：素材尖端朝右，运行时按飞行方向旋转。
- 参考图只锁辉光质感，不锁布局。

## Prompt

The attached reference image is ONE SINGLE VFX frame. Match its rendering style exactly: pure
black background, bright white-hot core, crisp hard-edged glowing shapes, small sparkle glints,
no soft photographic blur. It defines the STYLE ONLY, not the layout — you must produce the
2x3 grid described below, not a single frame.

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and black
is what becomes invisible in the game.

A 2x3 sprite sheet (2 rows, 3 columns) showing 6 frames of an ICE ORB — a compact glowing shard
of ice flying to the RIGHT, seen from DIRECTLY ABOVE (top-down). This is a LOOPING projectile:
frame 6 must be able to cut back to frame 1 without a pop. Do NOT make it appear and dissolve.
Do NOT draw a long beam that spans the cell.

SHAPE: a teardrop / comet of ICE pointing RIGHT. Fat faceted crystal head on the right, tapering
tail of smaller ice shards on the left. The head is a bright circular-ish crystal about 28% of
the cell width. The tail is short — about as long as the head, never more than 55% of the cell
width from tip to tail-end. Two or three chunky ice chips on the tail. This is a BALL of ice
with a short tail, not a lance, not a horizontal beam, not two opposing spikes, not a ring.

COLOR: frost-white #F7FBFF at the core of the head, ice-blue #A8D4FF in the mid crystal, deep
cobalt #3A7AB8 at the tail tip and outer glow. Cold ice colours only. No orange, no red, no
fire, no purple, no violet, no green, no gold.

FRAME ORDER, reading left-to-right then top-to-bottom. The ball PULSES while flying; size and
brightness oscillate, they do not grow then die:
  Frame 1 (row1 col1): Resting size. Head about 24% of cell width, tail modest, brightness medium.
  Frame 2 (row1 col2): Swelling. Head about 28%, brighter, one extra glint.
  Frame 3 (row1 col3): PEAK. Head about 32%, maximum brightness, tail longest but still short,
                       most glints.
  Frame 4 (row2 col1): Still bright, head back to about 28%, tail beginning to tuck in.
  Frame 5 (row2 col2): Head about 24%, slightly dimmer than frame 1, tail short.
  Frame 6 (row2 col3): Head about 22%, dimmest of the loop, tail a short stub. Next would be
                       frame 1 again. Still clearly an ice orb — do not fade to black.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 6 equal-size cells in a 2x3 grid: 2 rows, 3 columns. Every cell the same size.
3. NO borders, NO dividing lines, NO gutters, NO frames between cells.
4. The ice orb stays HORIZONTAL, pointing RIGHT, vertically CENTERED in its cell in all 6 frames.
   Never tilted, never vertical. The game rotates this sprite to aim it.
5. The whole teardrop must stay INSIDE its own cell with a thin black margin. Nothing may bleed
   into a neighboring cell. Do not let the tail reach the left cell edge.
6. This is a LOOP: brightness peaks at frame 3 then returns toward frame 1. Do NOT fade to black
   in frame 6. Do NOT draw six identical frames.
7. NO arrow, NO ring, NO character, NO book, NO staff, NO ground, NO terrain, NO grass, NO
   shadow. Only the abstract glowing ice orb on black.
8. Flat 2D game VFX illustration. NO motion blur, NO smoke, NO photographic depth of field.
9. NO text, NO labels, NO numbers, NO UI, NO watermark anywhere in the image.
