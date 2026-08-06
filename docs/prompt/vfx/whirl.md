# 旋风斩（whirl）特效 —— 黑底 additive 旋转刃环 9 帧（3x3 网格）

- 技能：`src/data/skillCatalog.ts` `whirl` —— 以自身为中心的曼哈顿 1 环 AoE，剑士默认技能。
- 运行时：`vfxCatalog.ts` 里 `at='caster' cells=3`（盖住 3×3 格）。
- 色相家族：**金橙**（剑士）。与普攻 `slash` 同族，靠形态区分：`slash` 是单道斜斩，
  这里是环绕一周的三片刃。同族是有意的——玩家该能靠颜色认出「金橙 = 剑士在出手」。
- 与 `roar` 的区别：`roar` 是光滑的扩散环（声波），这里必须是**分离的刃形**并且在**旋转**，
  否则两个特效在场上会读成同一个东西。
- 参考图：`godot/art/vfx/slash/frames/slash_02.png` —— 只锁辉光质感，不锁布局。

## Prompt

The attached reference image is ONE SINGLE VFX frame. Match its rendering style exactly: pure
black background, bright white-hot core, crisp hard-edged glowing shapes, small sparkle glints,
no soft photographic blur. It defines the STYLE ONLY, not the layout — you must produce the
3x3 grid described below, not a single frame.

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and black
is what becomes invisible in the game.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of a SPINNING BLADE VORTEX — a swordsman
sweeping his blade in a full circle around himself, seen from DIRECTLY ABOVE (top-down).

SHAPE: THREE separate crescent-shaped blade arcs, spaced 120 degrees apart around a common
center, each crescent thin and sharp like a scimitar edge with a bright white leading edge and a
tapering tail behind it. They are SEPARATE arcs with pure black gaps between them — this is NOT
a continuous smooth ring. A small hot spark sits at the exact center.

COLOR: white-hot at the leading edge of each crescent, blazing golden yellow in the body,
deep amber orange at the tapering tail. Warm golds and oranges only. No red, no blue, no green,
no purple.

FRAME ORDER, reading left-to-right then top-to-bottom. Two things change together across the
9 frames: the trio ROTATES CLOCKWISE about 40 degrees per frame (a full turn over the sheet),
and the radius GROWS. This combination is the whole point of the animation:
  Frame 1 (row1 col1): Blades tight around the center, radius about 20% of cell width, very
                       bright and compact, rotation angle 0 degrees.
  Frame 2 (row1 col2): Radius about 35%, rotated 40 degrees clockwise, crescents lengthening.
  Frame 3 (row1 col3): Radius about 48%, rotated 80 degrees, peak brightness, longest crescents.
  Frame 4 (row2 col1): Radius about 58%, rotated 120 degrees, still very bright.
  Frame 5 (row2 col2): Radius about 66%, rotated 160 degrees, crescents starting to thin.
  Frame 6 (row2 col3): Radius about 74%, rotated 200 degrees, clearly thinner, center spark dim.
  Frame 7 (row3 col1): Radius about 82%, rotated 240 degrees, breaking into shorter fragments.
  Frame 8 (row3 col2): Radius about 89%, rotated 280 degrees, faint thin fragments only.
  Frame 9 (row3 col3): Radius about 95%, rotated 320 degrees, three barely visible dim slivers.
                       Almost entirely black.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 9 equal-size cells in a 3x3 grid. Every cell the same size.
3. NO borders, NO dividing lines, NO gutters, NO frames between cells.
4. The center of the blade trio stays at the exact center of its cell in all 9 frames. The
   center must not drift — only radius and rotation change.
5. The radius must clearly INCREASE from frame 1 to frame 9 following the percentages above,
   and the rotation must clearly ADVANCE. Do NOT draw nine identical frames.
6. Keep THREE separate crescents with black gaps between them in every frame. Never merge them
   into one closed ring.
7. The effect must stay INSIDE its own cell. Even in frame 9 leave a thin black margin between
   the outermost glow and the cell edge. Nothing may bleed into a neighboring cell.
8. NO character, NO swordsman, NO body part, NO sword, NO hilt, NO silhouette, NO ground, NO
   terrain, NO grass, NO floor, NO shadow. Only the glowing effect on black.
9. Flat 2D game VFX illustration. NO motion blur, NO smoke, NO dust clouds, NO photographic
   depth of field, NO lens flare streaks across the image.
10. NO text, NO labels, NO numbers, NO arrows, NO UI, NO watermark anywhere in the image.
