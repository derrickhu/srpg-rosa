# 战场祝福（bless_rays）—— 黑底 additive 升光 9 帧（3x3 网格）

- 技能：`field_bless`「战场祝福」，锚在**施法者**脚下，盖住邻格（cells=3）。
- 用途：`SKILL_VFX.field_bless.impact.set='bless_rays'`，`anchor='caster' mode='burst' cells=3`。
- 色相家族：**青绿**。
- 形态：从中心向上/向外的四到六束短光柱，像祝福喷泉。不要十字、不要盾、不要火环、
  不要骑兵品红箭头环。商店临时槽也会卖这一招，所以形态必须自己能认。

## Prompt

The attached reference image is ONE SINGLE VFX frame. Match its rendering style: pure black
background, bright white-hot core, crisp hard-edged glowing shapes, small sparkle glints.
Style only — produce the 3x3 grid.

CRITICAL BACKGROUND: PURE BLACK #000000.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of a BLESSING FOUNTAIN of light, seen
from DIRECTLY ABOVE. FOUR short radial beams of light (north, east, south, west) bursting from
a bright center spark, plus a thin mint halo ring. NOT a plus-sign (heal owns that), NOT a kite
shield, NOT flame tongues, NOT inward-pointing chevron arrows.

SHAPE: a hot center spark, four short BAR-shaped rays pointing out to the four cardinals, and
one thin circular halo. Rays are rounded bars, not sharp spikes. The figure does NOT spin;
rays LENGTHEN then fade. This must read as "buff / blessing", not "hit" and not "heal".

COLOR: white-hot core, brilliant mint `#6EE7B7` rays, deep teal `#0D9488` tips and halo.
Mint greens only. No orange, no purple, no magenta, no pink.

FRAME ORDER, left-to-right then top-to-bottom. Rays grow then fade:
  Frame 1: tiny core, rays 15% of cell width
  Frame 2: rays 30%, halo appears at 25%
  Frame 3: PEAK, rays 48%, halo 40%, maximum brightness
  Frame 4: rays 50%, still bright, halo 50%
  Frame 5: rays 48%, dimmer, halo 58% thinning
  Frame 6: rays 35%, halo 65% broken
  Frame 7: short faint rays 20%, halo fading
  Frame 8: a few mint dashes
  Frame 9: dim specks. Almost black.

ABSOLUTE RULES:
1. Pure black. Exactly 9 equal cells, 3x3. No borders.
2. Center stays centered. Rays stay axis-aligned (cardinals), not diagonal.
3. Stay inside each cell with black margin.
4. No character, no banner, no sun disc, no text, no watermark.
5. Flat 2D game VFX. No motion blur, no smoke.
