# 血祭汲魂（ritespeaker_drain）特效 —— 黑底 additive 向心血漩 9 帧（3x3 网格）

- 技能皮肤：`ritespeaker_drain` → 底层 `blood_rite`（贴身 discAoE + 全额吸血 + 血池加成）
- 运行时：`SKILL_VFX.ritespeaker_drain`，`anchor='caster' mode='burst' cells=3.2`
- **与前五章的区别**：环向外、柱向上、线向前、雾下沉、锥张开。这一招必须**往里收**。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient.
This is an additive blend effect and black is what becomes invisible in the game.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of an INWARD BLOOD VORTEX —
ritual drain spiral seen from DIRECTLY ABOVE (top-down).

SHAPE: a bright white-hot core at the exact center, with a SPIRAL of dried-blood crimson
arms that PULL INWARD (not expand outward). Must read as "sucking in", not as a shockwave ring.
Leave pure black gaps between spiral arms.

COLOR: white-hot core → blazing scarlet mid → deep dried blood red (#7A2020) outer tips.
Warm reds only. NO gold-yellow hero slash. NO blue, NO green, NO purple, NO pink.

FRAME ORDER, left-to-right then top-to-bottom. The spiral TIGHTENS:
  Frame 1: Loose wide crimson spiral ~80% of cell, arms just forming, dim core.
  Frame 2: Spiral ~70%, arms clearer, core brightening.
  Frame 3: Spiral ~58%, pulling in, peak brightness starting.
  Frame 4: Spiral ~46%, tight coils, white-hot core.
  Frame 5: Spiral ~34%, very tight, brightest core.
  Frame 6: Spiral ~24%, almost a disk, core still hot.
  Frame 7: Spiral ~16%, collapsing, core dimming.
  Frame 8: Tiny ~10% knot, faint red wisps.
  Frame 9: Almost black; a few dim red specks at center.

ABSOLUTE RULES:
1. Background PURE BLACK #000000 everywhere, including between cells.
2. EXACTLY 9 equal cells in a 3x3 grid. NO borders, NO gutters.
3. Effect CENTERED in every cell — only radius changes, center must not drift.
4. Stay INSIDE each cell; leave thin black margin even on frame 1.
5. NO character, NO skull, NO weapon, NO ground, NO text, NO watermark.
6. Flat 2D game VFX. NO motion blur, NO smoke clouds.
