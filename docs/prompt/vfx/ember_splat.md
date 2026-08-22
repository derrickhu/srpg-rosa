# 火球溅射（ember_splat）—— 黑底 additive 火焰溅开 6 帧（2x3 网格）

- 用途：**法师普攻**命中，`vfxCatalog` 的 `ATTACK_VFX.mage.impact.set='ember_splat'`，`mode='burst'`。
- 色相家族：**赤焰**，与弹体 `ember_orb`、技能爆 `ember_burst` 同族。

## 为什么要这套图

法师普攻原先拿 `ember_orb`（**弹体本身**，一颗带焰尾的彗星）当命中闪光用。
弹体是**有朝向**的素材，飞行段按射向转过，而命中段 `mode='burst'` 把朝向钉死成 0
（朝右）——斜着射出去的那一发，一命中焰尾就从斜角瞬间掰成水平，屏幕上就是
「火球打到人身上会拐个弯」。**有朝向的素材当命中闪光用本身就是错的，炸开这个动作没有方向。**

改用 `ember_burst` 能解决拐弯，但那是「炎弹」技能的命中图，共用等于把普攻和技能看齐了
（`vfxCatalog.test.ts` 的守卫就是拦这个）。所以普攻要一张自己的。

形态上跟 `ember_burst` 的分工：

| | ember_burst（技能·炎弹） | ember_splat（普攻） |
|---|---|---|
| 动作 | 在空中**炸开** | 拍在身上**溅开** |
| 对称性 | 径向对称、八条等长火舌 | 长短不齐的火舌，偏向上舔 |
| 扩散环 | 有，是它的签名 | **没有**，换成飞散的火滴 |
| 量级 | 2.1 格、0.65 倍速，沉 | 1.45 格、0.95 倍速，脆 |

## Prompt

The attached reference image is ONE SINGLE VFX frame. Match its rendering style exactly: pure
black background, bright white-hot core, crisp hard-edged glowing shapes, small sparkle glints,
no soft photographic blur. It defines the STYLE ONLY, not the layout — you must produce the
2x3 grid described below, not a single frame.

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is
not part of the glowing effect must be absolutely black. No dark grey, no navy, no gradient, no
vignette, no fog, no glow bleeding into the corners. This is an additive blend effect and black
is what becomes invisible in the game.

A 2x3 sprite sheet (2 rows, 3 columns) showing 6 frames of a FIREBALL SPLATTERING against a
body — the moment a flying ball of fire hits something solid, flattens, and the flame licks
outward and UPWARD while burning droplets are flung off. This is a SPLAT, not an explosion.

SHAPE: a compact brilliant white-hot impact core, slightly WIDER than tall (the fire has
flattened against the target). From it grow 5 or 6 flame tongues of CLEARLY UNEQUAL length,
biased so the longest ones point UPWARD and upward-diagonally, with the shortest ones pointing
down — like fire splashing up off a surface. Plus 4 to 6 SEPARATE small teardrop-shaped burning
droplets flying away from the core, detached from it with black gaps between. Tiny sparkle glints
near the core.

CRITICAL: there is NO expanding circular ring in any frame. NO concentric circle, NO halo ring,
NO round shockwave outline. The flung droplets are what expands outward, not a ring.

COLOR: white-hot / pale yellow at the impact core, blazing orange-red #FF4A12 in the flame
tongues, deep crimson #B01400 at the tongue tips and on the droplets. Warm fire colours only.
No purple, no violet, no cyan, no blue, no green.

FRAME ORDER, reading left-to-right then top-to-bottom. This is a SHARP HIT: it appears at full
force immediately and collapses:
  Frame 1 (row1 col1): The instant of contact. Tiny extremely bright flattened core, tongues
                       barely started at about 15% of cell width, droplets not yet separated.
  Frame 2 (row1 col2): PEAK. Core at maximum brightness and widest, longest upward tongues reach
                       about 42% of cell width, shortest downward tongues about 18%. Droplets
                       just separating, close to the core.
  Frame 3 (row1 col3): Tongues retracting to about 34%, core still bright, droplets now clearly
                       detached and about 45% out from center.
  Frame 4 (row2 col1): Tongues shortened to about 22%, core dimming, droplets about 60% out and
                       getting smaller.
  Frame 5 (row2 col2): Only short faint upward stubs remain at about 12%, core nearly gone,
                       droplets about 75% out and very small.
  Frame 6 (row2 col3): Just a few dim scattered orange glints. Almost entirely black.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 6 equal-size cells in a 2x3 grid: 2 rows, 3 columns. Every cell the same size.
3. NO borders, NO dividing lines, NO gutters, NO frames between cells.
4. The impact core stays at the exact center of its cell in all 6 frames and must not drift.
5. NO expanding ring, NO concentric circle, NO round shockwave in any frame.
6. The flame tongues must be of UNEQUAL length and biased upward — this is what separates it
   from the radially symmetric explosion sprite.
7. Brightness must clearly PEAK at frame 2 and then fall off monotonically to frame 6. Do NOT
   draw six identical frames.
8. The effect must stay INSIDE its own cell, with a thin black margin at the cell edge. Nothing
   may bleed into a neighboring cell.
9. NO arrow, NO character, NO hat, NO staff, NO ground, NO terrain, NO grass, NO shadow, NO
   weapon. Only the abstract glowing fire splash on black.
10. Flat 2D game VFX illustration. NO motion blur, NO smoke, NO dust clouds, NO photographic
    depth of field.
11. NO text, NO labels, NO numbers, NO UI, NO watermark anywhere.
