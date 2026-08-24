# 霜弹溅冰（frost_splat）—— 黑底 additive 冰屑溅开 6 帧（2x3 网格）

- 用途：**芙洛普攻**命中，`vfxCatalog` 的 `FLOE_ATTACK_VFX.impact.set='frost_splat'`，`mode='burst'`。
- 色相家族：**霜冰**，与弹体 `frost_orb`、技能环 `frost_ring` 同族。

## 为什么要这套图

命中闪光不能拿弹体 `frost_orb` 充当：弹体有朝向，飞行段按射向转过，命中段
`mode='burst'` 会把朝向钉成 0，斜射会拐弯。也不能借技能的 `frost_ring`——
普攻和招牌会变成同一张图（`vfxCatalog.test.ts` 会拦）。

形态上跟 `frost_ring` 的分工：

| | frost_ring（技能·霜环） | frost_splat（普攻） |
|---|---|---|
| 动作 | 顶视**扩出去的冰棱环** | 拍在身上**溅开** |
| 对称性 | 径向对称、一圈等长冰棱 | 长短不齐的冰屑，偏向上飞 |
| 扩散环 | 有，是它的签名 | **没有**，换成飞散的冰滴 |
| 量级 | 3 格、0.7 倍速 | 1.45 格、0.95 倍速，脆 |

也禁止做成 `frost_burst` 那种「身上长出一丛竖冰」——那是霜噬叠层。

## Prompt

The attached reference image is ONE SINGLE VFX frame. Match its rendering style exactly: pure
black background, bright white-hot core, crisp hard-edged glowing shapes, small sparkle glints,
no soft photographic blur. It defines the STYLE ONLY, not the layout — you must produce the
2x3 grid described below, not a single frame.

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and black
is what becomes invisible in the game.

A 2x3 sprite sheet (2 rows, 3 columns) showing 6 frames of an ICE ORB SPLATTERING against a
body — the moment a flying ball of ice hits something solid, flattens, and ice chips fly
outward and UPWARD. This is a SPLAT, not an explosion, not a ring.

SHAPE: a compact brilliant frost-white impact core, slightly WIDER than tall (the ice has
flattened against the target). From it grow 5 or 6 ice shards of CLEARLY UNEQUAL length,
biased so the longest ones point UPWARD and upward-diagonally, with the shortest ones pointing
down — like ice splashing up off a surface. Plus 4 to 6 SEPARATE small teardrop-shaped ice
chips flying away from the core, detached from it with black gaps between. Tiny sparkle glints
near the core.

CRITICAL: there is NO expanding circular ring in any frame. NO concentric circle, NO halo ring,
NO round shockwave outline. The flung chips are what expands outward, not a ring.

COLOR: frost-white #F7FBFF at the impact core, ice-blue #A8D4FF in the shards, deep cobalt
#3A7AB8 at the shard tips and on the flying chips. Cold ice colours only. No orange, no red,
no fire, no purple, no violet, no green.

FRAME ORDER, reading left-to-right then top-to-bottom. This is a SHARP HIT: it appears at full
force immediately and collapses:
  Frame 1 (row1 col1): The instant of contact. Tiny extremely bright flattened core, shards
                       barely started at about 15% of cell width, chips not yet separated.
  Frame 2 (row1 col2): PEAK. Core at maximum brightness and widest, longest upward shards reach
                       about 42% of cell width, shortest downward shards about 18%. Chips
                       just separating, close to the core.
  Frame 3 (row1 col3): Shards retracting to about 34%, core still bright, chips now clearly
                       detached and about 45% out from center.
  Frame 4 (row2 col1): Shards shortened to about 22%, core dimming, chips about 60% out and
                       getting smaller.
  Frame 5 (row2 col2): Only short faint upward stubs remain at about 12%, core nearly gone,
                       chips about 75% out and very small.
  Frame 6 (row2 col3): Just a few dim scattered ice-blue glints. Almost entirely black.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 6 equal-size cells in a 2x3 grid: 2 rows, 3 columns. Every cell the same size.
3. NO borders, NO dividing lines, NO gutters, NO frames between cells.
4. The impact core stays at the exact center of its cell in all 6 frames and must not drift.
5. NO expanding ring, NO concentric circle, NO round shockwave in any frame.
6. The ice shards must be of UNEQUAL length and biased upward — this is what separates it
   from the radially symmetric frost ring.
7. Brightness must clearly PEAK at frame 2 and then fall off monotonically to frame 6. Do NOT
   draw six identical frames.
8. The effect must stay INSIDE its own cell, with a thin black margin at the cell edge. Nothing
   may bleed into a neighboring cell.
9. NO arrow, NO character, NO book, NO staff, NO ground, NO terrain, NO grass, NO shadow, NO
   weapon. Only the abstract glowing ice splash on black.
10. Flat 2D game VFX illustration. NO motion blur, NO smoke, NO dust clouds, NO photographic
    depth of field.
11. NO text, NO labels, NO numbers, NO UI, NO watermark anywhere.
