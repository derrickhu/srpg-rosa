# 燎原咒火（bloodfang_wildfire）特效 —— 黑底 additive 咒火窜起 9 帧（3x3 网格）

- 技能皮肤：`enemySkillCatalog` `bloodfang_wildfire` → 底层 `wild_burn`（自身曼哈顿 1 环 AoE + **点燃可燃地形**）。
- 运行时：`vfxCatalog.ts` 的 `SKILL_VFX.bloodfang_wildfire`，`anchor='caster' mode='burst' cells=3`。
- 技能类标准：9 帧 @20fps（见 §4.2）。

## 形态选择（§4.4 形态不能重复）

径向形状已经占满了：`roar` 是光滑扩散环（橙金），`bloodfang_roar` 是犬齿尖刺环（血红），
`quake` 是地面裂纹，`whirl` 是刃片。**再画一个环就分不出来了**，而这一招和血牙咆哮
偏偏会出现在同一个部族的两场 Boss 战里，撞形态的代价最大。

所以这条走**竖直生长**：一圈**互相分离的火柱从地面窜起**，读的是「脚下烧起来了」，
不是「一圈波扩散出去」。区分维度从半径换成高度，和机制（点燃脚下林地）也对得上。

配色跟图标一条线：**暗红到品红的咒火**，刻意避开篝火的橙黄——玩家的「松脂火把」
是暖橙工具火，Boss 这招是冷邪咒火，两者会在同一场战斗里先后出现。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and black
is what becomes invisible in the game.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of CURSED WILDFIRE ERUPTING FROM THE
GROUND — a ring of separate vertical flame pillars bursting upward around a caster, seen from a
slightly raised three-quarter view.

SHAPE: SIX to EIGHT SEPARATE, DISTINCT vertical FLAME PILLARS arranged in a RING around an empty
dark center. Each pillar is a narrow, tall, upward-licking tongue of fire with a bright core.
The pillars must stay SEPARATE with PURE BLACK GAPS between them — this must read as "several
individual fires standing up in a circle", NOT as a smooth expanding ring, NOT as a wall of fire,
NOT as one big single flame, NOT as a spiked sawblade ring. The ring's diameter barely changes;
what changes is the HEIGHT of the pillars. Keep the center of the ring dark and empty.

COLOR: hot white-pink core inside each pillar → blazing MAGENTA-RED (#C2185B) mid → DEEP CRIMSON
(#8B0000) at the flame tips. Cursed, unnatural fire. NO warm orange, NO yellow, NO gold — it must
NOT look like a campfire, a torch or a hero's fire spell. NO blue, NO green, NO purple.

FRAME ORDER, left-to-right then top-to-bottom. The pillars RISE, then thin out and collapse into
low embers. Pillar HEIGHT as a percentage of cell height:
  Frame 1: pillars just igniting at ground level, height ~12%, small bright hot roots, very bright.
  Frame 2: height ~30%, pillars clearly separate and rising, PEAK BRIGHTNESS.
  Frame 3: height ~48%, tall narrow tongues, hot cores.
  Frame 4: height ~62%, tallest point, tips beginning to fray and lean outward.
  Frame 5: height ~58%, pillars thinner, cores dimming, tips breaking into flecks.
  Frame 6: height ~45%, noticeably thinner and dimmer, gaps widening.
  Frame 7: height ~30%, broken low flames, only roots still hot.
  Frame 8: height ~18%, faint crimson stubs near the ground.
  Frame 9: almost black; only a few dim deep-red embers at the ground line.

ABSOLUTE RULES:
1. Background PURE BLACK #000000 everywhere, including between cells.
2. EXACTLY 9 equal cells in a 3x3 grid. NO borders, NO gutters, NO frames between cells.
3. Effect CENTERED in every cell — the ring must not drift; only pillar height changes.
4. Stay INSIDE each cell; leave a thin black margin even on the tallest frame.
5. NO character, NO body, NO wolf, NO weapon, NO torch, NO hand, NO ground texture, NO grass,
   NO trees, NO text, NO watermark.
6. Flat 2D game VFX. NO motion blur, NO smoke clouds, NO photographic depth of field.
7. NO outlines — effects are light, not stickers (§4.7).
