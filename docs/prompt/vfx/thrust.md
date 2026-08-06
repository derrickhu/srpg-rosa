# 骑兵普攻命中（thrust）—— 黑底 additive 楔形突刺 6 帧（2x3 网格）

- 用途：骑兵普攻命中，`vfxCatalog.ATTACK_VFX.cavalry`，`anchor='target' mode='aimed' cells=1.8`。
- 色相家族：**紫红**（骑兵）。骑兵角色主色是金黄 `#FCB40C`，和剑士撞色，所以特效另开一族。
- `mode='aimed'`：矛尖必须朝目标，素材一律画成**尖端朝右**，运行时旋转。
- 实测：一次成图可用。生图没把楔形居中在格子里（偏左上），靠 `vfx-sheet.py` 的质心对齐修掉。
- 参考图：`godot/art/vfx/slash/frames/slash_02.png`，只锁辉光质感，不锁布局。

## Prompt

The attached reference image is ONE SINGLE VFX frame. Match its rendering style exactly: pure
black background, bright white-hot core, crisp hard-edged glowing shapes, small sparkle glints,
no soft photographic blur. It defines the STYLE ONLY, not the layout — you must produce the
2x3 grid described below, not a single frame.

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and black
is what becomes invisible in the game.

A 2x3 sprite sheet (2 rows, 3 columns) showing 6 frames of a LANCE THRUST IMPACT — the flash of a
cavalry spear driving forward into a target, seen from DIRECTLY ABOVE (top-down).

SHAPE: a long narrow WEDGE of light, like a spearhead, with its sharp point aimed to the RIGHT and
its wide flared base on the LEFT. At the sharp right tip there is a small brilliant white-hot burst
with a few short splinter spikes. Behind the wedge base, two or three thin backward-swept streak
lines trail off to the left. Tiny sparkle glints near the tip.

COLOR: white-hot at the very tip, brilliant hot magenta pink through the wedge body, deep violet
purple at the flared base and trailing streaks. Magentas and violets only. No orange, no red, no
gold, no blue, no green.

FRAME ORDER, reading left-to-right then top-to-bottom. This is a fast forward stab: the wedge
extends to the right, peaks, then dissolves:
  Frame 1 (row1 col1): A short stubby wedge, total length about 30% of cell width, tip burst small
                       but very bright, positioned so the wedge is centered in the cell.
  Frame 2 (row1 col2): PEAK. Wedge extended to about 80% of cell width, tip burst at maximum
                       brightness with longest splinter spikes, trailing streaks clearly visible.
  Frame 3 (row1 col3): Wedge still about 80% long but thinner and dimmer, tip burst shrinking,
                       streaks longer and fainter.
  Frame 4 (row2 col1): Wedge breaking up, about 70% long, hollow and thin, tip burst nearly gone.
  Frame 5 (row2 col2): Only faint fragments of the wedge outline and a few drifting glints remain.
  Frame 6 (row2 col3): A couple of dim scattered specks. Almost entirely black.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 6 equal-size cells in a 2x3 grid: 2 rows, 3 columns. Every cell the same size.
3. NO borders, NO dividing lines, NO gutters, NO frames between cells.
4. The wedge must be HORIZONTAL with its sharp point aimed RIGHT in every single frame, never
   vertical, never diagonal, never pointing left. The game rotates this sprite to aim it.
5. The wedge stays centered in its cell; it must not slide across the cell between frames. Only
   its length, thickness and brightness change.
6. Brightness must clearly PEAK at frame 2 and then fall off monotonically to frame 6. Do NOT draw
   six identical frames.
7. The effect must stay INSIDE its own cell, with a thin black margin at the cell edge. Nothing may
   bleed into a neighboring cell.
8. NO spear, NO lance, NO pole, NO horse, NO rider, NO character, NO body part, NO silhouette, NO
   armour, NO ground, NO terrain, NO grass, NO shadow. Only the abstract glowing light effect on
   black.
9. Flat 2D game VFX illustration. NO motion blur, NO smoke, NO dust clouds, NO photographic depth
   of field.
10. NO text, NO labels, NO numbers, NO arrow symbols, NO UI, NO watermark anywhere in the image.
