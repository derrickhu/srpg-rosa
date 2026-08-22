# 蜂群（temp_gl_swarm）命中段 —— 绿幕抠图 / 普通混合 蜜蜂炸开 9 帧（3x3 网格）

- 技能：`temp_gl_swarm`（弹道绕目标三圈后炸开）。
- 运行时：`SKILL_VFX.temp_gl_swarm.impact`，`anchor='target' mode='burst' cells=2.6`。
- 弹道段是另一套图：`swarm_bees`（6 帧原地扰动），见 `docs/prompt/vfx/swarm_bees.md`。
- 切帧：`python3 scripts/vfx-sheet.py --key green --align center`。
- 图集：`blend: 'normal'`。

## 为什么是抠图而不是 additive

蜜蜂是虫，不是光。第一版走黑底 additive，量下来 52% 的像素在草地上看不出来——additive
按亮度烘 alpha，黑色的虫身会整个变透明，剩下的只有亮部，而亮部在亮草地上消失。
改成实体抠图后是 3%，而且黑黄条纹能读出来了，这是「蜂」这个字的全部辨识度所在。

键色用**绿**而不是洋红：主体是琥珀 + 黑 + 白的暖色，用洋红键会在翅膀边缘长出粉边；
反过来主体里没有饱和绿，用绿幕最干净。（绿幕抠出来再叠到绿草地上没有矛盾——
键控看的是饱和的纯绿 #00FF00，草地是黄绿的低饱和色。）

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE SATURATED GREEN #00FF00. Every pixel
that is not part of a bee must be pure chroma green. No dark edges, no black vignette, no gradient,
no glow, no shadow cast on the background. This is a chroma-key cutout: green is what gets deleted.
Do NOT use any green at all in the bees themselves.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of AN ANGRY BEE SWARM BURSTING OUTWARD from
a central point, seen from DIRECTLY ABOVE (top-down). Solid opaque insects, NOT glowing particles.

SHAPE: many individual small bees, each readable as a separate body — plump oval abdomen with
AMBER AND BLACK STRIPES, small dark grey wings, tiny dark legs. Bees fly outward in a loose
expanding ring with irregular spacing, some tumbling, a few trailing behind. Keep the very center
sparse from frame 4 on so the target character stays visible. NOT a smooth ring, NOT a dust cloud,
NOT a shockwave.

COLOR: warm amber / honey orange bodies with hard BLACK stripes, dark charcoal wings and legs,
a few near-black bees for depth. NO green anywhere. NO blue. NO purple. NO glow. NO fire.

FRAME ORDER, left-to-right then top-to-bottom. Swarm EXPANDS:
  Frame 1: Tight dense clump of bees at center, ~20% radius.
  Frame 2: Clump loosens and bulges, ~32%.
  Frame 3: Clearly separating into individuals, ~45%.
  Frame 4: Ragged expanding ring, ~58%, center thinning.
  Frame 5: Widest dense ring, ~70%, every bee readable, center nearly empty.
  Frame 6: Ring ~80%, spacing grows, some bees tumble.
  Frame 7: Scattered bees ~88%, thinning out.
  Frame 8: Only a handful of bees near the edges.
  Frame 9: Two or three lone bees, rest empty.

ABSOLUTE RULES:
1. Background PURE GREEN #00FF00 everywhere, including between cells.
2. EXACTLY 9 equal cells in a 3x3 grid. NO borders, NO gutters, NO frames between cells.
3. Swarm CENTERED in every cell — center must not drift between frames.
4. Stay INSIDE each cell; leave a thin green margin even on frame 9.
5. NO character, NO hive, NO flowers, NO text, NO watermark.
6. Flat 2D game asset, hard opaque edges. NO motion blur, NO bloom, NO depth of field.
