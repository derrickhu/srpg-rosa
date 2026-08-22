# 野草缠足（temp_gl_snare）—— 洋红抠图 / 普通混合 深色草结 9 帧（3x3 网格）

- 技能：`temp_gl_snare`（邻格选敌，减速，无伤）。
- 运行时：`SKILL_VFX.temp_gl_snare`，`anchor='target' mode='burst' cells=2.0`。
- 切帧：`python3 scripts/vfx-sheet.py --key magenta --align center`（抠图路线不烘 alpha）。
- 图集：`blend: 'normal'`。

## 为什么这张从黑底 additive 改成了抠图

第一版是黑底 additive 的亮绿藤蔓，出屏后是全库最看不清的一张：自身像素里 **64%**
与战场草地（RGB 202,225,54）色差 <60，等于没放特效。原因是双重的——additive 管线按亮度
烘 alpha，暗部一律变透明，所以这条路只有亮部画得出来，逼得草只能是亮绿；而草地本身就是亮绿。

修法不是「画亮一点」（那正是玩家抱怨的太亮），是让**深色实体**去和亮草地拉明度差。
草是植物、不是光，本来就不该走 additive。改完同一指标是 **2%**。

键色用洋红：主体是绿的，键色必须挑主体里没有的色相，否则键色既渗边又会被模型画进主体。

## 中心必须留空

第一版画成了一丛密草，中心没有洞。普通混合下这就是一块实心的草把被减速的那个敌人盖掉了
（单位区遮挡 71%）——看不见是谁中招等于这一招白放。第二版按「项圈 / 鸟巢边缘」重画，
中心 45% 宽度全程留空，遮挡降到 24%，人整个露在草环里。

这条对所有普通混合的 AoE 都成立，`temp_fo_bark` 也在同一个坑里翻过车两次。
additive 时代不用管这件事（只加不减，天然挡不住人），改抠图之后必须每张都验。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE MAGENTA #FF00FF. Every pixel that is
not part of the grass must be pure saturated magenta. No dark edges, no black vignette, no gradient,
no glow, no shadow on the background. This is a chroma-key cutout: magenta is what gets deleted.
Do NOT use any magenta, pink, purple or violet anywhere in the grass itself.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of TALL WILD GRASS BLADES cinching into a
RING around a completely EMPTY CENTER, seen from a high three-quarter angle. Solid opaque plant
matter, NOT glowing energy.

MOST IMPORTANT RULE — THE HOLLOW CENTER: in EVERY one of the 9 frames, the CENTRAL CIRCULAR AREA
covering roughly 45% of the cell's width MUST be COMPLETELY EMPTY PURE MAGENTA. No blade, no seed
head, no wisp may cross it. Think of a NEST RIM or a COLLAR seen from a high angle — grass grows only
around the rim and you see straight through the middle. A dense tuft, a filled clump, or a bush is
WRONG and unusable.

SHAPE: long thin tapered blades rising from the ground around the rim and BENDING INWARD over the
hole like a closing collar, without ever meeting in the middle. Blades cross each other near the rim.
A few slender seed heads. Clear magenta gaps between blade clusters so it reads as separate plants.
NOT a shockwave ring, NOT a slash arc.

COLOR: DARK and DESATURATED so it reads against bright yellow-green turf —
deep olive / dark moss / near-black bottle green, with only a few pale straw-yellow highlights on
blade edges. NO bright lime. NO neon green. NO gold-orange hero slash. NO blue. NO glow.

FRAME ORDER, left-to-right then top-to-bottom. The collar CINCHES IN but the hole never closes:
  Frame 1: A few short dark blades around a wide rim, sparse, hole large.
  Frame 2: More blades, taller, leaning inward slightly.
  Frame 3: Blades cross each other around the rim, hole slightly smaller.
  Frame 4: Dense woven collar, blades clearly bent inward over the rim.
  Frame 5: Tightest collar, darkest and densest, blades arching in — hole still clearly open.
  Frame 6: Collar holds, a few blades snap and spring outward.
  Frame 7: Blades loosening, several fall flat outward, hole widening.
  Frame 8: Sparse flattened blades lying outward around the rim.
  Frame 9: A couple of limp dark blades on the ground, rest empty.

ABSOLUTE RULES:
1. Background PURE MAGENTA #FF00FF everywhere, including between cells AND in the central hole.
2. EXACTLY 9 equal cells in a 3x3 grid. NO borders, NO gutters, NO frames between cells.
3. Effect CENTERED in every cell — center must not drift between frames.
4. Stay INSIDE each cell; leave a thin magenta margin even on frame 5.
5. NO character, NO ground texture, NO flowers, NO text, NO watermark.
6. Flat 2D game asset, hard opaque edges. NO motion blur, NO haze, NO bloom.
