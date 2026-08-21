# 炎弹命中（ember_burst）—— 黑底 additive 火爆 6 帧（2x3 网格）

- 用途：法师普攻与「炎弹」命中，`vfxCatalog` 的 `impact.set='ember_burst'`，`mode='burst'`。
- 色相家族：**赤焰**（炎系法师），与弹体 `ember_orb` 同族。
- 形态：径向对称的圆爆 + 短火舌，**不要**画成 `arrow_hit` 那种左右贯穿长钉。burst 不旋转。
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

A 2x3 sprite sheet (2 rows, 3 columns) showing 6 frames of a FIREBALL EXPLOSION — a round burst
of real fire, seen from DIRECTLY ABOVE (top-down). This is RADIALLY SYMMETRIC. It is NOT a
piercing streak, NOT two long horizontal spikes, NOT a sword slash.

SHAPE: a small brilliant white-hot circular core, with 8 short triangular FLAME TONGUES radiating
EVENLY around it (like a campfire burst seen from above), plus one thin expanding circular ring
of fire. The tongues are SHORT — at peak they reach about 40% of the cell width from center to
tip. Tiny sparkle glints near the core. Keep left/right and up/down the same; the game does not
rotate this sprite.

COLOR: white-hot / pale yellow at the core, blazing orange-red #FF4A12 in the flame tongues,
deep crimson #B01400 at the tips and outer ring. Warm fire colours only. No purple, no violet,
no cyan, no blue, no gold-yellow slash colour, no green.

FRAME ORDER, reading left-to-right then top-to-bottom. This is a SHARP HIT: it appears at full
force immediately and collapses:
  Frame 1 (row1 col1): The instant of impact. Tiny extremely bright core, tongues only about 18%
                       of cell width from center, no ring yet.
  Frame 2 (row1 col2): PEAK. Core at maximum brightness, 8 tongues at their longest (about 40% of
                       cell width from center), thin ring at about 30% of cell width.
  Frame 3 (row1 col3): Tongues beginning to retract to about 32%, core still bright, ring expanded
                       to about 50%.
  Frame 4 (row2 col1): Tongues shortened to about 22%, core dimming, ring at about 65% and thinning.
  Frame 5 (row2 col2): Only short faint stubs remain at about 12%, core nearly gone, ring
                       at about 80% and broken into arcs.
  Frame 6 (row2 col3): Just a few dim scattered orange glints and one barely visible broken arc at
                       about 90%. Almost entirely black.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 6 equal-size cells in a 2x3 grid: 2 rows, 3 columns. Every cell the same size.
3. NO borders, NO dividing lines, NO gutters, NO frames between cells.
4. The explosion core stays at the exact center of its cell in all 6 frames and must not drift.
5. The effect is RADIALLY SYMMETRIC in every frame — not stretched horizontally, not a left-right
   piercing line. The game plays this without rotating it.
6. Brightness must clearly PEAK at frame 2 and then fall off monotonically to frame 6. Do NOT
   draw six identical frames.
7. The effect must stay INSIDE its own cell, with a thin black margin at the cell edge. Nothing
   may bleed into a neighboring cell.
8. NO arrow, NO character, NO hat, NO staff, NO ground, NO terrain, NO grass, NO shadow. Only the
   abstract glowing fire explosion on black.
9. Flat 2D game VFX illustration. NO motion blur, NO smoke, NO dust clouds, NO photographic
   depth of field.
10. NO text, NO labels, NO numbers, NO UI, NO watermark anywhere.
