# 弓手普攻命中（arrow_hit）—— 黑底 additive 贯穿闪光 6 帧（2x3 网格）

- 用途：弓手普攻命中，`vfxCatalog.ATTACK_VFX.bow`，`anchor='target' mode='aimed' cells=1.6`。
- 色相家族：**青蓝**（弓手）。刻意避开草地的绿和剑士的金橙。
- `mode='aimed'`：长轴要对上箭的飞行方向，所以素材一律画成**水平朝右**，运行时旋转。
- 参考图：`godot/art/vfx/slash/frames/slash_02.png`，只锁辉光质感。
- 实测：一次成图可用。

## Prompt

The attached reference image is ONE SINGLE VFX frame. Match its rendering style exactly: pure
black background, bright white-hot core, crisp hard-edged glowing shapes, small sparkle glints,
no soft photographic blur. It defines the STYLE ONLY, not the layout — you must produce the
2x3 grid described below, not a single frame.

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and black
is what becomes invisible in the game.

A 2x3 sprite sheet (2 rows, 3 columns) showing 6 frames of an ARROW PIERCING IMPACT — the flash
of a arrow punching clean through a target, seen from DIRECTLY ABOVE (top-down).

SHAPE: a small brilliant white-hot impact core, with TWO long sharp needle-thin spikes shooting
out from it in exactly OPPOSITE directions along the HORIZONTAL axis (left and right),
representing the arrow's entry and exit path. The right-hand spike is longer than the left. Plus
four much shorter thin spikes at the diagonals, and one thin expanding elliptical ring around the
core. Tiny sparkle glints scattered near the core.

COLOR: white-hot at the impact core, brilliant cyan in the mid glow, deep teal blue at the spike
tips and outer ring. Cool cyans and teals only. No orange, no red, no gold, no green, no purple.

FRAME ORDER, reading left-to-right then top-to-bottom. This is a SHARP HIT: it appears at full
force immediately and collapses:
  Frame 1 (row1 col1): The instant of impact. Tiny extremely bright core, horizontal spikes only
                       about 25% of cell width long, no ring yet.
  Frame 2 (row1 col2): PEAK. Core at maximum brightness, horizontal spikes at their longest,
                       reaching about 85% of the cell width across, diagonal spikes visible,
                       thin ring at about 30% of cell width.
  Frame 3 (row1 col3): Spikes beginning to retract to about 70% of cell width, core still bright,
                       ring expanded to about 50%.
  Frame 4 (row2 col1): Spikes shortened to about 55%, core dimming noticeably, ring at about 65%
                       and thinning.
  Frame 5 (row2 col2): Only short faint spike stubs remain at about 35%, core nearly gone, ring
                       at about 80% and broken into arcs.
  Frame 6 (row2 col3): Just a few dim scattered glints and one barely visible broken arc at about
                       90%. Almost entirely black.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 6 equal-size cells in a 2x3 grid: 2 rows, 3 columns. Every cell the same size.
3. NO borders, NO dividing lines, NO gutters, NO frames between cells.
4. The impact core stays at the exact center of its cell in all 6 frames and must not drift.
5. The long spikes must be HORIZONTAL (pointing left and right), not vertical, not diagonal, in
   every single frame. The game rotates this sprite to aim it.
6. Brightness must clearly PEAK at frame 2 and then fall off monotonically to frame 6. Do NOT
   draw six identical frames.
7. The effect must stay INSIDE its own cell, with a thin black margin at the cell edge. Nothing
   may bleed into a neighboring cell.
8. NO arrow, NO arrowhead, NO shaft, NO feathers, NO bow, NO character, NO body part, NO
   silhouette, NO ground, NO terrain, NO grass, NO shadow. Only the abstract glowing light effect
   on black.
9. Flat 2D game VFX illustration. NO motion blur, NO smoke, NO dust clouds, NO photographic
   depth of field.
10. NO text, NO labels, NO numbers, NO arrows as symbols, NO UI, NO watermark anywhere.
