# 炎环（flame_ring）—— 黑底 additive 火舌环 9 帧（3x3 网格）

- 技能：`skillCatalog.flame_ring`「炎环」—— 以自身为中心、曼哈顿距离正好 2 的环（5×5）。
- 用途：`vfxCatalog.SKILL_VFX.flame_ring`，`anchor='caster' mode='burst' cells=5`。
- 色相家族：**赤焰**（炎系法师）。
- 形态必须和已有「环」区分开：`roar` 是光滑扩散环，`whirl` 是三片旋转刃，
  `bloodfang_wildfire` 是竖直火柱。这里是**一圈向外扩的火舌**，像从空中俯视的环形篝火。
- 参考图：`godot/art/vfx/slash/frames/slash_02.png`，只锁辉光质感，不锁布局。

## Prompt

The attached reference image is ONE SINGLE VFX frame. Match its rendering style exactly: pure
black background, bright white-hot core, crisp hard-edged glowing shapes, small sparkle glints,
no soft photographic blur. It defines the STYLE ONLY, not the layout — you must produce the
3x3 grid described below, not a single frame.

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and black
is what becomes invisible in the game.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of a RING OF FIRE — a circular burst of
flame tongues expanding outward from a caster, seen from DIRECTLY ABOVE (top-down).

SHAPE: a closed RING made of 8 to 10 chunky flame tongues pointing OUTWARD, like a campfire
crown viewed from above. Hollow in the middle. The tongues are rounded teardrop flames, NOT
crescent sword blades, NOT a smooth shockwave circle, NOT an eight-pointed star, NOT vertical
pillars. A tiny white-hot spark sits at the exact center. The ring does NOT spin; only its
radius grows.

COLOR: white-hot / pale yellow at the inner edge of each tongue, blazing orange-red #FF4A12 in
the body of the flames, deep crimson #B01400 at the outer tips. Warm fire colours only. No
purple, no violet, no cyan, no blue, no gold-yellow slash colour, no green.

FRAME ORDER, reading left-to-right then top-to-bottom. The fire ring EXPANDS. Radius grows
monotonically; brightness peaks early then holds while growing, then fades:
  Frame 1 (row1 col1): Tiny fire ring, radius about 18% of cell width, very bright and compact.
  Frame 2 (row1 col2): Radius about 28%, still very bright, tongues sharpening.
  Frame 3 (row1 col3): Radius about 38%, PEAK brightness, most glints.
  Frame 4 (row2 col1): Radius about 48%, still bright, ring thinning slightly.
  Frame 5 (row2 col2): Radius about 58%, brightness starting to fall, tongues longer.
  Frame 6 (row2 col3): Radius about 68%, noticeably dimmer, tongues becoming outlines.
  Frame 7 (row3 col1): Radius about 78%, mostly a thin ring of fire outlines, core spark faint.
  Frame 8 (row3 col2): Radius about 86%, broken dashed flames, a few embers drifting out.
  Frame 9 (row3 col3): Radius about 92%, a few dim scattered orange specks. Almost entirely black.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 9 equal-size cells in a 3x3 grid. Every cell the same size.
3. NO borders, NO dividing lines, NO gutters, NO frames between cells.
4. The ring stays centered in its cell in all 9 frames and must not drift. It does NOT rotate.
5. Radius must grow monotonically from frame 1 to frame 9. Do NOT draw nine identical frames.
6. The effect must stay INSIDE its own cell, with a thin black margin at the cell edge in every
   frame. Nothing may bleed into a neighboring cell — in late frames draw a smaller ring rather
   than clipping the tips.
7. NO sword blades, NO smooth closed ring without flames, NO star, NO character, NO hat, NO
   staff, NO ground, NO terrain, NO grass, NO shadow. Only the abstract glowing fire ring on black.
8. Flat 2D game VFX illustration. NO motion blur, NO smoke, NO photographic depth of field.
9. NO text, NO labels, NO numbers, NO UI, NO watermark anywhere in the image.
