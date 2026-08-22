# 荆棘绞缠（temp_fo_thorn）—— 洋红抠图 / 普通混合 荆棘向内收 9 帧（3x3 网格）

- 技能：`temp_fo_thorn`（范围束缚）。
- 运行时：`SKILL_VFX.temp_fo_thorn`，`anchor='target' mode='burst'`，起手用 `windupImplode`。
- 切帧：`python3 scripts/vfx-sheet.py --key magenta --align center`。
- 图集：`blend: 'normal'`。

## 这张图的辨识度靠什么

**方向**。全库的 AoE 一律向外扩，只有这一张是向内收的——所以它一放就认得出来。
起手的 `windupImplode` 和这个方向是一套的，两段都在往里收。

和野草缠足（`temp_gl_snare`）的分界是**尖刺和木质**：那张是细软草叶打结，
这张是带刺的木藤绞紧。同一个「缠」字要靠零件的材质分开，不能只靠颜色。

走抠图而不是 additive：荆棘是木头。深色木头在 additive 下暗部被烘成透明，
只有亮部画得出来，逼得藤只能是亮绿，而亮绿在亮草地上看不见（实测 53%）。
改抠图后 3%。

## 两条硬约束

**中心留空**：普通混合是真的不透明。第一版藤向内收到最后填满中心，把中招的敌人
盖掉了（全程平均遮挡 47%，尾帧 100%）。现在改成「笼 / 花环」——藤停在中心之外。

**尾帧必须变稀**：第一版越到后面越密，第 9 帧是全片最实的一张。特效不能以最重的
一帧收尾，那看起来像卡住了。现在 7、8、9 帧逐级散开，第 9 帧只剩两三根断枝。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE MAGENTA #FF00FF. Every pixel that is not
part of the brambles must be pure saturated magenta. No dark edges, no black vignette, no gradient,
no glow, no shadow on the background. This is a chroma-key cutout: magenta is what gets deleted.
Do NOT use any magenta, pink, purple or violet anywhere in the brambles.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of THORNY BRAMBLE VINES closing INWARD from
the outer edge, around a permanently EMPTY CENTER, seen from a high three-quarter angle.
Solid opaque woody plants, NOT glowing energy.

MOST IMPORTANT RULE — THE HOLLOW CENTER: in EVERY one of the 9 frames, the CENTRAL CIRCULAR AREA
covering roughly 40% of the cell's width MUST be COMPLETELY EMPTY PURE MAGENTA. No vine, no thorn,
no chip may cross it. The brambles form a CAGE or WREATH with an open middle you can see straight
through. A filled center or vines meeting in the middle is WRONG and unusable.

SECOND CRITICAL RULE — THE TAIL MUST THIN OUT: frames 7, 8 and 9 must get progressively SPARSER,
not denser. By frame 9 only a couple of small broken twigs remain. An animation that ends thicker
than it started is WRONG.

SHAPE: several thick woody vines with LARGE HARD THORNS along their length, entering from the outer
edge and curling inward like a closing cage, stopping short of the empty middle. Vines are gnarled
and angular, not smooth. Keep clear gaps between vines so the silhouette reads as "plants gripping"
rather than "energy circle". NOT a shockwave ring, NOT a slash arc.

COLOR: DARK and DESATURATED so it reads against bright yellow-green turf —
dark bark brown, near-black forest green, deep olive, with pale bone-grey highlights only on the
thorn TIPS. NO bright lime. NO neon green. NO gold-orange. NO glow.

FRAME ORDER, left-to-right then top-to-bottom. Vines CLOSE IN, then BREAK APART:
  Frame 1: Vine tips just entering from the outer edge, very sparse, hole huge.
  Frame 2: Vines reach inward a little, thorns becoming readable.
  Frame 3: Vines longer, curling begins, hole still wide.
  Frame 4: A clear inward cage forms, thorns prominent.
  Frame 5: Tightest grip and densest frame — vines ring the empty middle, hole still fully open.
  Frame 6: Vines hold, a few thorns snap off as chips flying outward.
  Frame 7: Vines visibly CRACKING and pulling back outward, noticeably sparser than frame 5.
  Frame 8: Only broken vine fragments near the outer edge, mostly empty.
  Frame 9: Two or three small dark broken twigs, almost the whole cell empty.

ABSOLUTE RULES:
1. Background PURE MAGENTA #FF00FF everywhere, including between cells AND in the central hole.
2. EXACTLY 9 equal cells in a 3x3 grid. NO borders, NO gutters, NO frames between cells.
3. Effect CENTERED in every cell — center must not drift between frames.
4. Stay INSIDE each cell; leave a thin magenta margin even on frame 5.
5. NO character, NO ground texture, NO text, NO watermark.
6. Flat 2D game asset, hard opaque edges. NO motion blur, NO haze, NO bloom.
