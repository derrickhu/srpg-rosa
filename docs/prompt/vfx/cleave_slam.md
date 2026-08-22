# 重劈（cleave_slam）—— 黑底 additive 重斩劈裂 9 帧（3x3 网格）

- 技能：`skillCatalog.cleave`「重劈」—— 剑士可学，邻格点名单体 0.88 倍率，纯伤害点杀。
- 用途：`vfxCatalog.SKILL_VFX.cleave`，`anchor='target' mode='burst' cells=2.3`。
- 色相家族：**金橙**（剑士）。同族已有三个形态，这一张必须和它们都分得开：
  | 招式 | 形态 | 读作 |
  |---|---|---|
  | 普攻 `slash` | 细月牙横扫弧 | 挥了一刀 |
  | 旋风斩 `whirl` | 绕身 360° 刃环 | 转了一圈 |
  | **重劈 `cleave_slam`** | **极粗的垂直劈痕 + 落点向两侧崩开** | **砸下来了** |
  | 破阵斩 `blade_x` | 交叉 X 双斩 | 划开了 |
  「重」靠**厚度和崩裂**读，不靠更大的弧——同族两条弧只是尺寸不同的话，
  玩家分不出自己按的是哪个键。
- `mode='burst'` 不旋转：垂直下劈这件事和目标在左边还是右边无关，
  转了反而会出现「横着劈」。
- 参考图：`godot/art/vfx/slash/frames/slash_02.png`，只锁辉光质感，不锁布局。

## Prompt

The attached reference image is ONE SINGLE VFX frame. Match its rendering style exactly: pure
black background, bright white-hot core, crisp hard-edged glowing shapes, small sparkle glints,
no soft photographic blur. It defines the STYLE ONLY, not the layout — you must produce the
3x3 grid described below, not a single frame.

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and black
is what becomes invisible in the game.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of a HEAVY OVERHEAD CLEAVE IMPACT — a
greatsword coming straight down and splitting what it hits.

SHAPE: ONE very THICK, slightly tapered VERTICAL slash scar running from the top of the cell down
through the center, widest near the middle and narrowing at both ends, like a wound cut into the
air. At the lower end of the scar, a BURST OF ANGULAR SPLIT SHARDS breaks outward to the left and
right in a shallow V, as if the impact point ruptured sideways. Two or three thin horizontal
pressure lines flick outward from the impact point. This must read as ONE SINGLE MASSIVE VERTICAL
CUT with a rupture at its base. Do NOT draw a crescent arc. Do NOT draw a circular ring. Do NOT
draw a star burst. Do NOT draw multiple parallel slashes.

COLOR: brilliant white-hot along the very core of the vertical scar, saturated golden yellow in
the body of the scar and the shards, deep hard-edged orange at the outer rim and the shard tips.
Golds, ambers and warm oranges only. No red, no crimson, no cyan, no green, no purple, no silver.

FRAME ORDER, reading left-to-right then top-to-bottom. The vertical scar is at full length almost
immediately (that is what makes it read as a single decisive chop); the SIDEWAYS RUPTURE is what
grows across the frames:
  Frame 1 (row1 col1): The vertical scar appears at about 55% of cell height, thin, moderately
                       bright. No side shards yet.
  Frame 2 (row1 col2): PEAK BRIGHTNESS. Scar at full 85% height and at its THICKEST, blazing
                       white core. Side shards just beginning to appear at the base, small.
  Frame 3 (row1 col3): Scar still full height, very bright but slightly thinner. Side shards
                       reach about 25% of cell width on each side.
  Frame 4 (row2 col1): Scar thinning, brightness clearly down from the peak. Side shards reach
                       about 40% of cell width.
  Frame 5 (row2 col2): Scar noticeably thinner and dimmer. Side shards reach about 55%, pressure
                       lines visible.
  Frame 6 (row2 col3): Scar reduced to a thin bright line. Side shards reach about 68% and are
                       breaking into separate fragments.
  Frame 7 (row3 col1): Scar faint and broken into segments. Shard fragments at about 80%, dim.
  Frame 8 (row3 col2): Only a few dim fragments of the scar remain. Shard fragments at about 88%,
                       very faint.
  Frame 9 (row3 col3): Almost entirely black, a couple of dim outer shard tips at about 94%.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 9 equal-size cells in a 3x3 grid. Every cell the same size.
3. NO borders, NO dividing lines, NO gutters, NO frames between cells.
4. The vertical scar stays centered horizontally in its cell in all 9 frames and must not drift
   sideways. Only its thickness, the shard spread and the brightness change.
5. Brightness must PEAK AT FRAME 2 and then decrease monotonically to frame 9. Do NOT make
   frame 5 or frame 9 the brightest.
6. The scar must be a STRAIGHT VERTICAL CUT, not a curve and not a diagonal.
7. The effect must stay INSIDE its own cell, with a thin black margin at the cell edge. Nothing
   may bleed into a neighboring cell.
8. NO character, NO swordsman, NO sword, NO blade silhouette, NO weapon, NO hand, NO body part,
   NO armor, NO ground, NO grass, NO terrain, NO shadow. Only the abstract glowing light effect
   on black.
9. Flat 2D game VFX illustration. NO motion blur, NO smoke, NO dust, NO photographic depth of
   field. NO text, NO labels, NO numbers, NO UI, NO watermark anywhere.
