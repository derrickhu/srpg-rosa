# 穿透箭（pierce）—— 黑底 additive 贯穿光束 9 帧（3x3 网格）

- 技能：`skillCatalog.pierce`「穿透箭」—— 弓手默认技能，四向射线穿透，取总 HP 最大的一线。
- 用途：`vfxCatalog.SKILL_VFX.pierce`，`anchor='caster' mode='beam' cells=1.1`。
- **`mode='beam'` 的素材要求和别的不一样**：光束必须**顶满格子左右两边**。运行时会把它锚在
  施法者身上、沿射线方向拉长到最远那个命中目标；中间留黑边的话拉出来就是断的。
  纵向仍按 `cells` 走，所以细长比例是运行时给的，素材只管画一根水平光束。
- 色相家族：**青蓝**（弓手），与普攻 `arrow_hit` 同族。
- 实测：一次成图可用。
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

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of a PIERCING ENERGY BEAM — a magic
arrow's shot that punches through everything in a straight line, seen from DIRECTLY ABOVE
(top-down).

SHAPE: one long straight HORIZONTAL lance of light that spans the full width of its cell, left edge
to right edge. It is thin — about 12% of the cell height at its thickest — with a razor-sharp
white-hot core line running down its middle and a soft glow sheath around it. The beam is thickest
at its left end and tapers slightly toward the right. Along the beam sit three or four small
chevron-shaped ripples pointing right, plus a scatter of tiny glints just above and below the beam
line.

COLOR: white-hot along the razor core line, brilliant cyan in the glow sheath, deep teal blue at
the outer edge and in the chevron ripples. Cool cyans and teals only. No orange, no red, no gold,
no green, no purple.

FRAME ORDER, reading left-to-right then top-to-bottom. The beam FIRES, HOLDS, then DISSOLVES. Its
length always spans the full cell width once fired; what changes is thickness and brightness:
  Frame 1 (row1 col1): The beam is just igniting — a thin faint hairline spanning the full cell
                       width, only about 30% of final thickness, dim.
  Frame 2 (row1 col2): The beam snaps to full power. Full thickness, maximum brightness, chevron
                       ripples bright and crisp.
  Frame 3 (row1 col3): PEAK HOLD. Same full thickness, maximum brightness, most glints, thickest
                       glow sheath.
  Frame 4 (row2 col1): Still bright but the glow sheath has narrowed slightly, chevrons drifting
                       right.
  Frame 5 (row2 col2): Noticeably thinner, about 70% of full thickness, sheath dimmer, core line
                       still white.
  Frame 6 (row2 col3): About 50% thickness, the core line is breaking into dashes, chevrons faint.
  Frame 7 (row3 col1): About 30% thickness, mostly a broken dashed line of light, glints drifting
                       away.
  Frame 8 (row3 col2): A very faint hairline with only two or three bright dashes left on it.
  Frame 9 (row3 col3): A few dim scattered specks along where the beam was. Almost entirely black.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 9 equal-size cells in a 3x3 grid. Every cell the same size.
3. NO borders, NO dividing lines, NO gutters, NO frames between cells.
4. The beam must be perfectly HORIZONTAL and vertically CENTERED in its cell in all 9 frames. Never
   tilted, never vertical, never curved. The game rotates and stretches this sprite to aim it.
5. The beam must reach BOTH the left and the right edge of its own cell in frames 2 through 8 — it
   is a full-length beam, not a short dash in the middle. Do not leave a black gap at the left or
   right end.
6. Thickness and brightness must PEAK at frames 2-3 and then fall off monotonically to frame 9. Do
   NOT draw nine identical frames.
7. Nothing may bleed vertically into a neighboring cell; leave black margins above and below the
   beam.
8. NO arrow, NO arrowhead, NO shaft, NO feathers, NO bow, NO character, NO body part, NO silhouette,
   NO ground, NO terrain, NO grass, NO shadow. Only the abstract glowing light effect on black.
9. Flat 2D game VFX illustration. NO motion blur, NO smoke, NO photographic depth of field, NO lens
   flare bloom crossing the whole image.
10. NO text, NO labels, NO numbers, NO UI, NO watermark anywhere in the image.
