# 飞爪钩索（temp_ft_grapple）—— 洋红抠图 / 普通混合 铁爪 + 绷索 9 帧（3x3 网格）

- 技能：`temp_ft_grapple`（远距拉拽）。
- 运行时：`SKILL_VFX.temp_ft_grapple`，`anchor='target' mode='burst'`。
- 切帧：`python3 scripts/vfx-sheet.py --key magenta --align center`。
- 图集：`blend: 'normal'`。

## 为什么是抠图

钩索是**铁和麻绳**，全程没有一处发光。走 additive 的话暗部会被烘成透明，
一根深灰的铁爪基本消失；而把它画亮成「发光的爪」既假又撞上「太亮」那条抱怨。
实体抠图之后铁爪的轮廓、绳索的绞股都读得出来，量下来草地隐形率 2%。

形态上守住「爪张开 → 咬住 → 绷紧回拉」这条动作线——绳子从松弛到绷直是「拉拽」
这个动词的全部表达，比任何光效都清楚。

## 绳子不许横穿格心

第一版把爪画在格心、绳子横穿整格，于是每一帧都压在目标身上（全程平均遮挡 50%）——
被拉的那个人从头到尾看不见。现在整套构图挤到**左三分之一**：爪咬在中心空区的左缘，
绳子往左出画，中心 45% 全程留空。读起来是「钩住了他的肩」而不是「钩子盖住了他」。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE MAGENTA #FF00FF. Every pixel that is not
part of the hook or rope must be pure saturated magenta. No dark edges, no black vignette, no
gradient, no glow, no shadow on the background. This is a chroma-key cutout: magenta is what gets
deleted. Do NOT use any magenta, pink, purple or violet anywhere in the hook or rope.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of an IRON GRAPPLING CLAW biting at the LEFT
RIM of an empty center and yanking, with a rope trailing off to the LEFT edge. Seen from a slightly
HIGH THREE-QUARTER angle.

MOST IMPORTANT RULE — THE EMPTY CENTER: in EVERY one of the 9 frames, the CENTRAL CIRCULAR AREA
covering roughly 45% of the cell's width MUST be COMPLETELY EMPTY PURE MAGENTA. Neither the claw,
nor the rope, nor any chip may enter or cross it. The rope must NOT run through the middle of the
cell — it stays in the LEFT THIRD, and the claw grabs at the LEFT EDGE of that empty circle, as if
biting the shoulder of something standing in the middle. A rope crossing the center, or a claw
sitting in the center, is WRONG and unusable.

SHAPE: a chunky three-pronged IRON CLAW with visible rivets and a thick eye ring, attached to a
TWISTED HEMP ROPE with visible braided strands running from the claw leftward and off the left edge.
A few angular dirt chips knocked loose, all on the left side. NOT a ring, NOT a shockwave,
NOT a slash, NOT energy.

COLOR: DARK and DESATURATED so it reads against bright yellow-green turf —
dark gunmetal and near-black iron with pale steel highlights on the prong edges; rope in dark
tobacco brown with straw-tan strand highlights. NO glow. NO bright green. NO gold. NO blue.

FRAME ORDER, left-to-right then top-to-bottom. Claw FLIES IN, BITES at the rim, then PULLS:
  Frame 1: Small claw entering at the far left edge, prongs closed, rope slack and wavy.
  Frame 2: Claw larger, closer to the rim, prongs beginning to open.
  Frame 3: Claw at the left rim, prongs spread wide, rope still slightly slack.
  Frame 4: Prongs at maximum spread, poised to bite, rope straightening.
  Frame 5: Prongs SNAP shut on the rim, a couple of dirt chips knocked loose.
  Frame 6: Rope goes TAUT — a straight tense line to the left edge, claw gripping hard.
  Frame 7: Claw begins dragging leftward, rope still taut and straight.
  Frame 8: Claw further left and smaller, dirt chips trailing behind it.
  Frame 9: Claw mostly off the left edge; only a short length of taut rope and a chip or two remain.

ABSOLUTE RULES:
1. Background PURE MAGENTA #FF00FF everywhere, including between cells AND in the central circle.
2. EXACTLY 9 equal cells in a 3x3 grid. NO borders, NO gutters, NO frames between cells.
3. Everything stays in the LEFT portion of the cell; the right third stays empty magenta.
4. Stay INSIDE each cell; leave a thin magenta margin at top and bottom.
5. NO character, NO hand, NO ground texture, NO text, NO watermark.
6. Flat 2D game asset, hard opaque edges. NO motion blur, NO haze, NO bloom.
