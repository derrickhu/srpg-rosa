# 草药敷治（temp_gl_salve）特效 —— 黑底 additive 药草治愈光 9 帧（3x3 网格）

- 技能：`temp_gl_salve`（邻格选友，治疗）。
- 运行时：`SKILL_VFX.temp_gl_salve`，`anchor='target' mode='burst' cells=1.5`。
- 柔和治愈感：翠绿叶片 + 淡金药粉，读成「上药」而不是爆炸。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and black
is what becomes invisible in the game.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of HERBAL SALVE HEAL BURST —
soft glowing mint leaves and tiny pollen motes rising from a point, seen from DIRECTLY ABOVE.

SHAPE: a soft radial bloom of 5–7 stylized leaf silhouettes + small bright pollen dots,
gentle and round — NOT spikes, NOT fangs, NOT a hard shockwave ring, NOT a slash.

COLOR: white-mint core → soft emerald / seafoam mid → deep teal-green outer.
Tiny warm pollen accents OK (pale gold flecks only). NO orange slash gold. NO red. NO blue laser.

FRAME ORDER, left-to-right then top-to-bottom. Bloom then settle:
  Frame 1: Tiny mint spark at center ~15%.
  Frame 2: Soft petal bloom ~30%, bright.
  Frame 3: Full leaf blossom ~45%, peak brightness + pollen.
  Frame 4: Leaves open ~55%, still bright.
  Frame 5: Soft fade begins, pollen drifts out.
  Frame 6: Leaves thinning ~50%.
  Frame 7: Sparse leaf tips + motes.
  Frame 8: Faint mint fragments.
  Frame 9: Almost black; few dim green dots.

ABSOLUTE RULES:
1. Background PURE BLACK #000000 everywhere, including between cells.
2. EXACTLY 9 equal cells in a 3x3 grid. NO borders, NO gutters, NO frames between cells.
3. Effect CENTERED in every cell.
4. Stay INSIDE each cell; leave thin black margin even on frame 9.
5. NO character, NO bottle, NO ground, NO text, NO watermark.
6. Flat 2D game VFX. Soft heal feel, not violent explosion.
