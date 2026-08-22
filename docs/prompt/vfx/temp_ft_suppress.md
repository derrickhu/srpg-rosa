# 压制号令（temp_ft_suppress）—— 黑底 additive 下压人字纹 9 帧（3x3 网格）

- 技能：`temp_ft_suppress`（范围降攻/降速，无伤）。
- 运行时：`SKILL_VFX.temp_ft_suppress`，`anchor='target' mode='burst'`。
- 切帧：`python3 scripts/vfx-sheet.py --key black --align center --alpha-gamma 2.0`。
- 图集：`blend: 'add'`。

## 形态的由来

零伤害的减益技能在回放里连伤害数字都不飘，所以特效必须自己把「被压住了」说清楚。
全库的 AoE 要么向外扩、要么向内收，都是**水平**方向；这张走**垂直向下**——
一组人字纹从上往下压，落地压出一道被压扁的弧。方向是它唯一的辨识度来源，
不能改成环形，否则立刻和另外十来个环光混在一起。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is not
part of the effect must be absolutely black. No dark grey, no navy, no gradient, no vignette, no fog,
no glow bleeding into the corners. This is an additive blend effect and black is what becomes
invisible in the game.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of a DOWNWARD SUPPRESSION SLAM — a stack of
CHEVRONS (arrow-like "v" shapes) pointing DOWN, driving down onto a squashed arc on the floor, seen
from a slightly HIGH THREE-QUARTER angle.

SHAPE: three or four nested chevrons pointing DOWNWARD, stacked vertically with black gaps between
them, plus a flattened wide ellipse arc at the bottom where they land. Short vertical pressure lines
between the chevrons. Everything reads as WEIGHT PRESSING DOWN. NOT a ring, NOT an expanding
shockwave, NOT a slash arc, NOT an upward burst.

COLOR: cold steel — pale silver-white core → slate blue-grey mid → dark gunmetal edges. A single
muted brass accent on the topmost chevron. NO fire orange. NO green. NO purple. NO blood red.

FRAME ORDER, left-to-right then top-to-bottom. Chevrons DRIVE DOWN:
  Frame 1: One faint chevron high up in the cell, floor arc absent.
  Frame 2: Two chevrons, slightly lower, dim floor line appears.
  Frame 3: Three chevrons descending, floor arc forming.
  Frame 4: Chevrons near the bottom, floor arc bright and widening.
  Frame 5: PEAK — chevrons compressed onto the floor arc, brightest, arc widest and flattest.
  Frame 6: Chevrons flatten further, arc starts fading at the ends.
  Frame 7: Chevrons dissolving into short dashes, arc dimmer.
  Frame 8: Only a faint flattened arc and a few dashes.
  Frame 9: Almost black; a dim grey smear on the floor line.

ABSOLUTE RULES:
1. Background PURE BLACK #000000 everywhere, including between cells and between chevrons.
2. EXACTLY 9 equal cells in a 3x3 grid. NO borders, NO gutters, NO frames between cells.
3. Horizontally CENTERED in every cell; the downward motion is the only movement.
4. Chevrons must point DOWN in all 9 frames.
5. Stay INSIDE each cell; leave a thin black margin even on frame 5.
6. NO character, NO banner, NO ground texture, NO text, NO watermark.
7. Flat 2D game VFX. NO motion blur, NO smoke clouds.
