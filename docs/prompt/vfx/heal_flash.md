# 圣疗（heal_flash）—— 黑底 additive 十字光 9 帧（3x3 网格）

- 技能：`heal_touch`「圣疗」，锚在**目标友军**身上。
- 用途：`SKILL_VFX.heal_touch.impact.set='heal_flash'`，`anchor='target' mode='burst' cells=1.8`。
- 色相家族：**青绿**。
- 形态：粗十字 / 加号光。对齐技能图标那只手掌上的加号。不要画成盾，不要画成火环。

## Prompt

The attached reference image is ONE SINGLE VFX frame. Match its rendering style: pure black
background, bright white-hot core, crisp hard-edged glowing shapes, small sparkle glints.
Style only — produce the 3x3 grid.

CRITICAL BACKGROUND: PURE BLACK #000000.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of a HOLY HEALING CROSS, seen from
DIRECTLY ABOVE. A chunky PLUS SIGN / CROSS of light, arms of equal length, rounded ends.
NOT a ring of fire, NOT a kite shield, NOT a six-point burst, NOT chevron arrows.

SHAPE: one thick plus sign centered in the cell. Each arm is about as wide as 12% of the cell.
White-hot core line down the middle of each arm, mint glow sheath. Tiny glints at the four tips
and the center. The cross does NOT rotate; only its size and brightness change.

COLOR: white-hot along the core, brilliant mint `#6EE7B7` in the glow, deep teal `#0D9488` at
the outer edge. Mint greens only. No orange, no purple, no magenta, no gold slash.

FRAME ORDER, left-to-right then top-to-bottom. The cross APPEARS, HOLDS, then fades. Size grows
slightly then holds; brightness peaks at frames 2-3:
  Frame 1: small faint plus, about 22% of cell width
  Frame 2: snaps to full, about 55%, very bright
  Frame 3: PEAK HOLD, 60%, maximum brightness, most glints
  Frame 4: still 60%, slightly thinner glow
  Frame 5: 58%, dimmer
  Frame 6: 55%, arms becoming outlines
  Frame 7: 50%, broken dashed plus
  Frame 8: 45%, a few mint dashes
  Frame 9: scattered dim specks. Almost black.

ABSOLUTE RULES:
1. Pure black. Exactly 9 equal cells, 3x3. No borders.
2. Cross stays centered, axis-aligned (not rotated, not diagonal).
3. Stay inside each cell with black margin.
4. No character, no hand, no shield, no sun, no text, no watermark.
5. Flat 2D game VFX. No motion blur, no smoke.
