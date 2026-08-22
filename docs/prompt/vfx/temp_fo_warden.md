# 守林人之姿（temp_fo_warden）—— 洋红抠图 / 普通混合 根须 + 树冠 9 帧（3x3 网格）

- 技能：`temp_fo_warden`（自身强化，森林主题的压轴招）。
- 运行时：`SKILL_VFX.temp_fo_warden`，`anchor='caster' mode='burst'`。
- 切帧：`python3 scripts/vfx-sheet.py --key magenta --align center`。
- 图集：`blend: 'normal'`。

## 形态怎么和同章的树皮庇护分开

从前这两招**共用 `ward_aegis` 一张图**，同章同色同形，放出来分不清。
现在靠「占哪一段画面」分：树皮庇护是**贴着身体的甲**（中段一圈），
这张是**上下两段**——根须往地里铺开、树冠往天上撑开，而**中间那条带留空**。
中间留空一举两得：既让施法者自己看得见，又让这张的剪影和任何「一圈」都不一样。

走抠图的原因同荆棘：木头是实体，additive 只画得出亮部，而亮绿在亮草地上消失（实测 50%）。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE MAGENTA #FF00FF. Every pixel that is not
part of the roots or canopy must be pure saturated magenta. No dark edges, no black vignette, no
gradient, no glow, no shadow on the background. This is a chroma-key cutout: magenta is what gets
deleted. Do NOT use any magenta, pink, purple or violet anywhere in the plants.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of a FOREST WARDEN'S AWAKENING: gnarled ROOTS
spreading across the ground in the LOWER part of the cell, and a leafy CANOPY opening in the UPPER
part of the cell, with an EMPTY MAGENTA BAND across the MIDDLE of every cell.

SHAPE: bottom third — thick woody roots snaking outward flat along the ground, tapering, with a few
lifted knuckles. Top third — broad overlapping leaf clusters and a few branch forks opening like an
umbrella. Middle third — COMPLETELY EMPTY pure magenta in every frame, no exceptions. NOT a ring,
NOT a shockwave, NOT a full tree, NOT a dome.

COLOR: DARK and DESATURATED so it reads against bright yellow-green turf —
roots in dark bark brown and near-black; canopy in deep pine green and dark olive with a few
pale sage highlights on the topmost leaves. NO bright lime. NO neon green. NO gold. NO glow.

FRAME ORDER, left-to-right then top-to-bottom. Roots SPREAD and canopy OPENS:
  Frame 1: Two or three short root tips below; a tight leaf bud above.
  Frame 2: Roots reach ~40% outward; bud starts splitting.
  Frame 3: Roots ~60%; two leaf clusters unfolding.
  Frame 4: Roots ~80%; canopy half open.
  Frame 5: Roots fully spread, canopy fully open — widest, darkest, densest frame.
  Frame 6: Same spread, leaves settle, a few leaves detach.
  Frame 7: Canopy begins folding, roots start withdrawing.
  Frame 8: Sparse roots and a couple of leaf clusters left.
  Frame 9: A few dark root tips and one small leaf cluster, rest empty.

ABSOLUTE RULES:
1. Background PURE MAGENTA #FF00FF everywhere, including between cells and across the middle band.
2. EXACTLY 9 equal cells in a 3x3 grid. NO borders, NO gutters, NO frames between cells.
3. The MIDDLE HORIZONTAL BAND of each cell must stay pure magenta in ALL 9 frames.
4. Composition CENTERED in every cell — must not drift between frames.
5. Stay INSIDE each cell; leave a thin magenta margin even on frame 5.
6. NO character, NO trunk connecting roots to canopy, NO ground texture, NO text, NO watermark.
7. Flat 2D game asset, hard opaque edges. NO motion blur, NO haze, NO bloom.
