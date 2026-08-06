# 震击（quake）—— 黑底 additive 地面裂纹 9 帧（3x3 网格）

- 技能：`skillCatalog.bash`「震击」—— 盾卫默认技能，邻格最低 HP 单体 + 自身嘲讽 2 回合。
- 用途：`vfxCatalog.SKILL_VFX.bash`，`anchor='caster' mode='burst' cells=3`。
  **注册键是 skillId（bash），不是素材名（quake）**，这两个不同名，写错的表现是特效悄悄不见。
- 色相家族：**银白**（盾卫），与普攻 `bash_hit` 同族，靠形态区分：普攻是星芒，这里是角状裂纹。
- 实测：一次成图可用。裂纹形态和 `bash_hit` 的星芒区分度足够，同族不会混。
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

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of a GROUND SHOCKWAVE FRACTURE — a heavy
guardian slamming the earth so hard the ground cracks outward around him, seen from DIRECTLY ABOVE
(top-down).

SHAPE: a network of JAGGED STRAIGHT FRACTURE LINES radiating outward from the exact center like
cracks in stone, roughly eight main cracks with small branching splinters, plus ONE thin bright
expanding ring that travels outward along with the crack tips. The center holds a small dense
white-hot glow. This must read as angular CRACKS, not as curved arcs and not as a star burst.

COLOR: white-hot at the center and along the crack cores, bright silver white in the crack bodies,
pale steel blue grey at the crack tips and the expanding ring. Whites, silvers and cool greys only.
No orange, no red, no gold, no cyan, no green, no purple.

FRAME ORDER, reading left-to-right then top-to-bottom. The cracks LENGTHEN outward and the ring
EXPANDS across all 9 frames; this outward travel is the whole point of the animation:
  Frame 1 (row1 col1): A tight bright impact glow at the center, cracks only just starting,
                       reaching about 15% of cell width. Ring not visible yet.
  Frame 2 (row1 col2): Cracks reach about 30% of cell width, thin ring appears at about 30%,
                       brightness rising.
  Frame 3 (row1 col3): PEAK. Cracks reach about 45%, ring at about 45%, everything at maximum
                       brightness, splinter branches clearly visible.
  Frame 4 (row2 col1): Cracks reach about 58%, ring at about 58%, still bright, center glow
                       beginning to dim.
  Frame 5 (row2 col2): Cracks reach about 68%, ring at about 68% and thinner, center glow much
                       dimmer.
  Frame 6 (row2 col3): Cracks reach about 78%, ring at about 78%, crack bodies thinning, center
                       nearly dark.
  Frame 7 (row3 col1): Cracks reach about 86%, ring at about 86% and breaking into segments, only
                       crack tips still glow.
  Frame 8 (row3 col2): Cracks reach about 92%, faint, only the outer thirds of the cracks still
                       visible, ring mostly broken.
  Frame 9 (row3 col3): A few dim outer crack tips and broken ring fragments at about 96%. Almost
                       entirely black.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 9 equal-size cells in a 3x3 grid. Every cell the same size.
3. NO borders, NO dividing lines, NO gutters, NO frames between cells.
4. The center of the fracture stays at the exact center of its cell in all 9 frames and must not
   drift. Only the crack length, ring radius and brightness change.
5. Keep it RADIALLY SYMMETRIC overall with no single dominant direction — this effect is never
   rotated by the game.
6. Cracks must be ANGULAR AND STRAIGHT with sharp kinks, like shattered stone. Do not draw smooth
   curved arcs, do not draw a star burst with tapered rays, do not draw lightning bolts.
7. The crack length and ring radius must clearly INCREASE from frame 1 to frame 9 following the
   percentages above. Do NOT draw nine identical frames.
8. The effect must stay INSIDE its own cell, with a thin black margin at the cell edge. Nothing may
   bleed into a neighboring cell.
9. NO character, NO guardian, NO shield, NO hammer, NO weapon, NO body part, NO silhouette, NO
   rocks, NO rubble, NO soil, NO grass, NO terrain texture, NO shadow. Only the abstract glowing
   light effect on black.
10. Flat 2D game VFX illustration. NO motion blur, NO smoke, NO dust clouds, NO photographic depth
    of field. NO text, NO labels, NO numbers, NO UI, NO watermark anywhere.
