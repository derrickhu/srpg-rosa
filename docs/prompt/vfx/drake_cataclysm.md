# 灭世龙息（drake_cataclysm）特效 —— 黑底 additive 锥形吐息 9 帧（3x3 网格）

- 技能皮肤：`enemySkillCatalog` `drake_cataclysm` → 底层 `dragon_breath`
  （`lineBestRayAllFoes` + `percentTargetMaxHp` + 残血处决）。
- 运行时：`vfxCatalog.ts` 的 `SKILL_VFX.drake_cataclysm`，锥形挂在 `cast`（`anchor='caster' mode='aimed'`），
  沿线再走 `pathBeam`，每个被穿到的人各播一次 `impact`。
- 技能类标准：9 帧 @20fps（见 §4.2）。
- `mode='aimed'`：吐息必须朝目标，所以素材**一律画成窄口在左、朝右张开**，运行时旋转
  （同 `thrust`、`temp_ft_ram` 的约定）。

## 形态选择（§4.4 形态不能重复）

这一招和第三章「破阵冲撞」**底层形状完全相同**（都是 `lineBestRayAllFoes`），
所以特效是玩家区分两者的唯一线索，而且不能靠颜色——破阵已经是红色系了。

区分落在**锥形张开**上：破阵是等宽的一条贯穿线（`pathGlow` + 逐个突刺），
这一招是**从一点张开的锥**，越远越宽。玩家分不清「一条线」和「另一条线」，
但分得清「从他嘴里喷出来的」和「他整个人撞过来的」。

竖直生长（`bloodfang_wildfire` 的火柱）、向外扩散（`roar` / `bloodfang_roar` 的环）
这两个维度都已占满，锥形是剩下的那个没人用过的方向。

配色跟图标一条线：**白热内芯 → 橙 → 深红外沿**。刻意和第二章咒火（暗红转品红）
反着走色温——咒火是邪的，龙息是烫的。全库最亮的一张，因为它是终章最后一招。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and black
is what becomes invisible in the game.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of a DRAGON'S BREATH — a searing CONE of
white-hot fire blasted horizontally to the RIGHT.

SHAPE: a CONE that clearly FANS OUT. It starts as a small, narrow, brilliant white-hot MUZZLE POINT
at the LEFT EDGE of the cell, and blasts rightward, getting steadily WIDER, ending in a broad
flame-front at the RIGHT that is at least FOUR TIMES wider than where it started. Layered interior
following the fan: a blazing WHITE-HOT core stripe down the centre axis, a hot ORANGE body around
it, and a DEEP RED outer rim at the cone's edge. The broad right end breaks into three or four
thick, blunt, rounded tongues of fire.

This must read as "a cone sprayed out of a mouth". It must NOT be a straight beam of even
thickness, NOT a ring, NOT an expanding circle, NOT a ball, NOT a lightning bolt, NOT an arrow,
NOT a vertical pillar. The cone is STRICTLY HORIZONTAL, narrow end on the LEFT, wide end on the
RIGHT, in every single frame — it must never rotate, never point up, never point left.

COLOR: brilliant WHITE-HOT (#FFF6E0) core → hot ORANGE (#FF7A18) body → DEEP RED (#B3200C) rim.
Searing, furnace-hot fire. NO pink, NO magenta, NO purple, NO violet, NO blue, NO green.
The white core must be the brightest thing in the sheet.

FRAME ORDER, left-to-right then top-to-bottom. The cone SPEARS OUT, floods to full width, then
burns down. Cone LENGTH as a percentage of cell width, and how far the wide end has opened:

  Frame 1: only the muzzle point ignites at the left — a small brilliant white-hot knot,
           length ~15%, barely opened. Very bright, no red yet.
  Frame 2: length ~40%, the cone punches rightward as a narrow white-orange wedge.
  Frame 3: length ~70%, clearly fanning out now, orange body filling in.
  Frame 4: length ~100% — reaches the right edge, widest opening, PEAK BRIGHTNESS,
           front end split into thick blunt tongues.
  Frame 5: still full length, slightly narrower, white core thinning toward the muzzle,
           red rim strengthening.
  Frame 6: length ~95%, noticeably dimmer, the core is now only near the muzzle,
           the far end is mostly deep red.
  Frame 7: length ~80%, the cone is breaking apart into separate rolling lobes of red fire,
           muzzle dimming.
  Frame 8: length ~55%, faint deep-red remnants drifting right, no white left.
  Frame 9: almost black; a few dim deep-red flecks along the axis.

ABSOLUTE RULES:
1. Background PURE BLACK #000000 everywhere, including between cells.
2. EXACTLY 9 equal cells in a 3x3 grid. NO borders, NO gutters, NO frames between cells.
3. The muzzle point stays PINNED at the LEFT of every cell — the cone grows to the right,
   it does not drift, slide or re-centre.
4. Stay INSIDE each cell; leave a thin black margin top and bottom even on the widest frame.
5. NO dragon, NO head, NO jaw, NO teeth, NO eye, NO neck, NO body, NO character, NO weapon,
   NO ground, NO text, NO watermark.
6. Flat 2D game VFX. NO motion blur, NO smoke clouds, NO photographic depth of field.
7. NO outlines — effects are light, not stickers (§4.7).
8. Brightness must clearly PEAK at frame 4 and then fall off monotonically to frame 9.
