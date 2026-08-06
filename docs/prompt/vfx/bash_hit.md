# 盾卫普攻命中（bash_hit）—— 黑底 additive 钝击星芒 6 帧（2x3 网格）

- 用途：盾卫普攻命中，`vfxCatalog.ATTACK_VFX.shield`，`anchor='target' mode='burst' cells=1.35 alpha=0.85`。
- 色相家族：**银白**（盾卫）。盾卫角色主色是蓝 `#246CB4`，青蓝给了弓手，所以这一族走高对比白银。
- `mode='burst'`：径向对称，不旋转。
- 实测：一次成图可用，但**峰值亮区占到 54%**（其余特效在 20% 上下），叠加上去会把挨打的人
  整个糊白。素材没重生，改用运行时的 `cells`/`alpha` 收了一档——见 `vfxCatalog` 的 alpha 注释。
  下次可以在 prompt 里限制「rays 不超过格宽的 40%」来从源头压。
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

A 2x3 sprite sheet (2 rows, 3 columns) showing 6 frames of a BLUNT SHIELD BASH IMPACT — the flash
of a heavy shield slamming into a target, seen from DIRECTLY ABOVE (top-down).

SHAPE: a thick chunky six-pointed star burst, radially symmetric, with SHORT BLUNT wedge-shaped
rays rather than thin needles — this must read as heavy and concussive, not sharp. A dense
white-hot core fills the middle. One thick expanding shock ring surrounds it. A scatter of small
chunky glints sits between the rays.

COLOR: pure white-hot core, bright silver white through the rays, pale steel blue grey at the
outer ring and ray tips. Whites, silvers and cool greys only. No orange, no red, no gold, no cyan,
no green, no purple, no saturated blue.

FRAME ORDER, reading left-to-right then top-to-bottom. This is a heavy slam: instant full-force
flash, then a slow heavy fade:
  Frame 1 (row1 col1): The instant of contact. Small dense core, blunt rays only about 20% of cell
                       width, no ring yet, extremely bright.
  Frame 2 (row1 col2): PEAK. Core largest and brightest, blunt rays extended to about 55% of cell
                       width, thick shock ring at about 40% of cell width.
  Frame 3 (row1 col3): Rays about 60% of cell width but thinner, core shrinking, ring expanded to
                       about 60% and still thick.
  Frame 4 (row2 col1): Rays stubby again and much dimmer, core small, ring at about 75% and
                       thinning.
  Frame 5 (row2 col2): Rays nearly gone, only a dim center smudge, ring at about 88% and breaking
                       into arcs.
  Frame 6 (row2 col3): One faint broken outer arc and a few dim specks. Almost entirely black.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 6 equal-size cells in a 2x3 grid: 2 rows, 3 columns. Every cell the same size.
3. NO borders, NO dividing lines, NO gutters, NO frames between cells.
4. The burst stays at the exact center of its cell in all 6 frames and must not drift.
5. Keep the star RADIALLY SYMMETRIC with six evenly spaced blunt rays. No single dominant long
   spike, no directional bias — this effect is never rotated by the game.
6. Rays must be SHORT AND THICK, wedge shaped. Do not draw long thin needle spikes or lens flare
   streaks.
7. Brightness must clearly PEAK at frame 2 and then fall off monotonically to frame 6. Do NOT draw
   six identical frames.
8. The effect must stay INSIDE its own cell, with a thin black margin at the cell edge. Nothing may
   bleed into a neighboring cell.
9. NO shield, NO boss, NO rim, NO weapon, NO character, NO body part, NO silhouette, NO armour, NO
   ground, NO terrain, NO grass, NO shadow. Only the abstract glowing light effect on black.
10. Flat 2D game VFX illustration. NO motion blur, NO smoke, NO dust clouds, NO photographic depth
    of field. NO text, NO labels, NO numbers, NO UI, NO watermark anywhere.
