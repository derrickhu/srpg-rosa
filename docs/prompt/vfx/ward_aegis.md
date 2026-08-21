# 守护祷言（ward_aegis）—— 黑底 additive 盾光 9 帧（3x3 网格）

- 技能：`ward_prayer`「守护祷言」，锚在**目标友军**身上。
- 用途：`SKILL_VFX.ward_prayer.impact.set='ward_aegis'`，`anchor='target' mode='burst' cells=2.2`。
- 色相家族：**青绿**，外沿可以带一点金白高光（和技能图标的金边盾呼应），主体仍是 mint。
- 形态：风筝盾轮廓。不要画成十字（那是圣疗），不要画成光滑扩散环（那是 roar）。

## Prompt

The attached reference image is ONE SINGLE VFX frame. Match its rendering style: pure black
background, bright white-hot core, crisp hard-edged glowing shapes, small sparkle glints.
Style only — produce the 3x3 grid.

CRITICAL BACKGROUND: PURE BLACK #000000.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of a HOLY AEGIS SHIELD, seen from
DIRECTLY ABOVE. A hollow KITE-SHIELD / rounded-triangle outline of light, point down, with a
small plus spark at the exact center. NOT a plus-sign that fills the cell, NOT a fire ring,
NOT three sword blades, NOT inward chevron arrows.

SHAPE: one shield outline, like a chunky rounded kite. Thick glowing rim, hollow inside except
the tiny center spark. The shield does NOT spin; it APPEARS, holds, then dissolves.

COLOR: white-hot on the inner rim, brilliant mint `#6EE7B7` on the body of the rim, deep teal
`#0D9488` at the outer edge. A touch of pale gold-white `#F0FFF4` on the brightest highlights is
allowed. No orange fire, no purple, no magenta, no cyan-blue.

FRAME ORDER, left-to-right then top-to-bottom. Radius / size grows then holds then fades:
  Frame 1: small faint shield, about 25% of cell height
  Frame 2: snaps larger, 50%, bright
  Frame 3: PEAK, 62%, maximum brightness, crisp rim
  Frame 4: still 62%, rim slightly thinner
  Frame 5: 60%, dimmer
  Frame 6: 58%, rim becoming a dashed outline
  Frame 7: 55%, broken arcs of the shield
  Frame 8: 50%, a few mint dashes
  Frame 9: dim specks. Almost black.

ABSOLUTE RULES:
1. Pure black. Exactly 9 equal cells, 3x3. No borders.
2. Shield stays centered, point down, not rotated from frame to frame.
3. Stay inside each cell with black margin.
4. No character, no full filled heraldic art, no sun disc, no text, no watermark.
5. Flat 2D game VFX. No motion blur, no smoke.
