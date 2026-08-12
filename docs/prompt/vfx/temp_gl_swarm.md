# 惊扰蜂群（temp_gl_swarm）特效 —— 黑底 additive 虫群旋环 9 帧（3x3 网格）

- 技能：`temp_gl_swarm`（自身半径 1 圆盘 AoE + 中毒）。
- 运行时：`SKILL_VFX.temp_gl_swarm`，`anchor='caster' mode='burst' cells=3`。
- 琥珀虫群旋绕，读成「蜂群炸开」，不是光滑冲击波。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and black
is what becomes invisible in the game.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of ANGRY INSECT SWARM RING —
many tiny glowing amber-yellow insect silhouettes swirling outward from center, top-down.

SHAPE: a RING made of dozens of tiny wedge/dot insect shapes (like a swirling locust/bee cloud),
NOT a smooth energy circle, NOT vines, NOT fangs. Black gaps between insects so it reads as swarm.

COLOR: white-hot yellow cores → amber / honey mid → burnt orange outer.
NO green. NO cyan. NO blood red. NO purple. NO sword gold-orange slash arcs.

FRAME ORDER, left-to-right then top-to-bottom. Swarm EXPANDS:
  Frame 1: Tight swarm knot ~20% radius, very bright.
  Frame 2: Ring ~32%, insects readable as dots/wedges.
  Frame 3: Ring ~45%, denser swirl, peak brightness.
  Frame 4: Ring ~58%, insects stretching outward.
  Frame 5: Ring ~70%, thinner cloud.
  Frame 6: Ring ~80%, breaking into arcs of insects.
  Frame 7: Ring ~88%, sparse insect arcs.
  Frame 8: Ring ~94%, faint outer dots only.
  Frame 9: Almost black; few dim amber specks at edge.

ABSOLUTE RULES:
1. Background PURE BLACK #000000 everywhere, including between cells.
2. EXACTLY 9 equal cells in a 3x3 grid. NO borders, NO gutters, NO frames between cells.
3. Effect CENTERED; only radius changes.
4. Stay INSIDE each cell; leave thin black margin even on frame 9.
5. NO character, NO beehive, NO ground, NO text, NO watermark.
6. Flat 2D game VFX. NO motion blur, NO smoke.
