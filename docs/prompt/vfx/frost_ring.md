# 霜环（frost_ring）—— 黑底 additive 冰棱环 9 帧（3x3 网格）

- 技能：`skillCatalog.frost_ring`「霜环」—— 3 格内选点，`blastRadius: 1`（直径 3 格）。
- 用途：`vfxCatalog.SKILL_VFX.frost_ring`，`anchor='target' mode='burst' cells=3`。
- 色相家族：**霜冰**（芙洛）。白核 → `#a8d4ff` → `#3a7ab8`。
- 形态必须和已有「环」区分开：`roar` 是光滑扩散环，`whirl` 是三片旋转刃，
  `flame_ring` 是一圈向外的**圆头火舌**。这里是**一圈向外戳的三角冰棱**，
  像从空中俯视的冰晶王冠。不旋转，只扩半径。
- 参考图只锁辉光质感，不锁布局。

## Prompt

The attached reference image is ONE SINGLE VFX frame. Match its rendering style exactly: pure
black background, bright white-hot core, crisp hard-edged glowing shapes, small sparkle glints,
no soft photographic blur. It defines the STYLE ONLY, not the layout — you must produce the
3x3 grid described below, not a single frame.

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and black
is what becomes invisible in the game.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of a RING OF ICE — a circular crown of
ice-crystal spikes expanding outward from a ground target, seen from DIRECTLY ABOVE (top-down).

SHAPE: a closed RING made of 8 to 10 chunky TRIANGULAR ice prisms pointing OUTWARD, like a
frozen crown viewed from above. Hollow in the middle. The spikes are sharp faceted crystals,
NOT rounded flame tongues, NOT crescent sword blades, NOT a smooth shockwave circle, NOT an
eight-pointed star, NOT vertical pillars. A tiny white-hot spark sits at the exact center.
The ring does NOT spin; only its radius grows.

COLOR: brilliant frost-white #F7FBFF at the inner edge of each spike, ice-blue #A8D4FF in the
body of the crystals, deep cobalt #3A7AB8 at the outer tips. Cold ice colours only. No orange,
no red, no fire, no purple, no violet, no green, no gold.

FRAME ORDER, reading left-to-right then top-to-bottom. The ice ring EXPANDS. Radius grows
monotonically; brightness peaks early then holds while growing, then fades:
  Frame 1 (row1 col1): Tiny ice ring, radius about 18% of cell width, very bright and compact.
  Frame 2 (row1 col2): Radius about 28%, still very bright, spikes sharpening.
  Frame 3 (row1 col3): Radius about 38%, PEAK brightness, most glints.
  Frame 4 (row2 col1): Radius about 48%, still bright, ring thinning slightly.
  Frame 5 (row2 col2): Radius about 58%, brightness starting to fall, spikes longer.
  Frame 6 (row2 col3): Radius about 68%, noticeably dimmer, spikes becoming outlines.
  Frame 7 (row3 col1): Radius about 78%, mostly a thin ring of crystal outlines, core spark faint.
  Frame 8 (row3 col2): Radius about 86%, broken dashed ice shards, a few motes drifting out.
  Frame 9 (row3 col3): Radius about 92%, a few dim scattered ice-blue specks. Almost entirely black.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 9 equal-size cells in a 3x3 grid. Every cell the same size.
3. NO borders, NO dividing lines, NO gutters, NO frames between cells.
4. The ring stays centered in its cell in all 9 frames and must not drift. It does NOT rotate.
5. Radius must grow monotonically from frame 1 to frame 9. Do NOT draw nine identical frames.
6. The effect must stay INSIDE its own cell, with a thin black margin at the cell edge in every
   frame. Nothing may bleed into a neighboring cell — in late frames draw a smaller ring rather
   than clipping the tips.
7. NO flame tongues, NO smooth closed ring without crystals, NO star, NO character, NO book,
   NO staff, NO ground, NO terrain, NO grass, NO shadow. Only the abstract glowing ice ring on black.
8. Flat 2D game VFX illustration. NO motion blur, NO smoke, NO photographic depth of field.
9. NO text, NO labels, NO numbers, NO UI, NO watermark anywhere in the image.
