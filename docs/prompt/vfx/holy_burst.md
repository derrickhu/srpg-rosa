# 圣光命中（holy_burst）—— 黑底 additive 6 帧（2x3 网格）

- 用途：祭司普攻命中，`ATTACK_VFX.healer.impact.set='holy_burst'`，`mode='burst'`。
- 色相家族：**青绿**。
- 形态：径向对称的六点星爆。不要画成加号（那是圣疗）、不要画成盾（那是祷言）、
  不要画成火舌、不要画成骑兵品红箭头环。

## Prompt

The attached reference image is ONE SINGLE VFX frame. Match its rendering style: pure black
background, bright white-hot core, crisp hard-edged glowing shapes, small sparkle glints.
Style only, not layout — produce the 2x3 grid.

CRITICAL BACKGROUND: PURE BLACK #000000.

A 2x3 sprite sheet (2 rows, 3 columns) showing 6 frames of a HOLY SPARK BURST, seen from
DIRECTLY ABOVE. RADIALLY SYMMETRIC. Not a plus sign, not a kite shield, not flame tongues,
not inward-pointing chevron arrows.

SHAPE: a small white-hot circular core with SIX short diamond-shaped spark spikes radiating
EVENLY (every 60 degrees). Spikes are SHORT — peak about 38% of cell width from center to tip.
Tiny glints near the core. No expanding ring (the heal skill owns the ring/cross language).

COLOR: white-hot core, brilliant mint `#6EE7B7` spikes, deep teal `#0D9488` tips.
Mint greens only. No orange, no gold slash, no cyan-blue, no purple, no magenta, no pink.

FRAME ORDER, left-to-right then top-to-bottom. SHARP HIT, peak at frame 2, then collapse:
  Frame 1: tiny bright core, spikes 16% of cell width, no extra glints
  Frame 2: PEAK, spikes 38%, maximum brightness
  Frame 3: spikes 30%, still bright
  Frame 4: spikes 20%, core dimming
  Frame 5: stub spikes 12%, core nearly gone
  Frame 6: a few dim mint glints. Almost black.

ABSOLUTE RULES:
1. Pure black background. Exactly 6 equal cells, 2x3. No borders.
2. Core stays centered. Radially symmetric. Game does not rotate this sprite.
3. Brightness peaks at frame 2 then falls. Stay inside each cell.
4. No plus sign, no shield, no character, no text, no watermark.
5. Flat 2D game VFX. No motion blur, no smoke.
