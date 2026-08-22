# 盾墙震慑（shield_wall）—— 黑底 additive 盾牌冲击波 9 帧（3x3 网格）

- 技能：`skillCatalog.shield_wall`「盾墙震慑」—— 盾卫可学（`reserved`，主槽等一个控制路线的
  盾卫角色，但**商店临时槽在卖，玩家拿得到**），邻格 AoE 0.4 倍率 + 群体削攻 4 点 / 2 回合。
- 用途：`vfxCatalog.SKILL_VFX.shield_wall`，`anchor='caster' mode='burst' cells=3.1`。
- 色相家族：**银白**（盾卫）。同族已有三个形态，这一张必须和它们都分得开：

  | 招式 | 形态 | 读作 |
  |---|---|---|
  | 普攻 `bash_hit` | 单点星爆 | 砸了一下 |
  | 震击 `quake` | 地面裂纹向外爬 | 地裂了 |
  | 铁锤 `hammer_smash` | 单点重砸 + 环形尘 | 一锤砸实了 |
  | **盾墙震慑 `shield_wall`** | **两三道同心六边形冲击环向外推** | **一面墙推开了** |

  「震慑」是**推开**不是**砸下**：所以用**向外扩张的同心环**，而不是任何形式的落点爆。
  六边形（不是圆）是它和 `quake` 的地面裂纹、和祭司圆形光环的分界——盾的轮廓是有棱的。
- 为什么不复用 `quake`：同一个职业的两招用同一张图，玩家分不出自己按的是哪个键。
  `quake` 是**地面**裂纹（贴地、向下），这一张是**空中**冲击环（立起来、向外）。
- 这一招是 AoE 且施法者在正中心，所以特效**必须**盖满 3×3 并且中心留空——
  中心被光糊住的话，玩家看不见自己的单位站在哪。
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

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of an EXPANDING HEXAGONAL SHOCKWAVE —
a shield slammed down sending concentric rings of force outward in every direction.

SHAPE: TWO or THREE CONCENTRIC HEXAGONAL RING OUTLINES centered in the cell, expanding outward
together. Each ring is a thin, crisp, hard-edged hexagon outline with clearly visible straight
segments and sharp corners — angular, not round. The rings are OUTLINES ONLY: the area inside
the innermost ring must stay PURE BLACK and EMPTY, because the player's own unit stands there.
A few short angular chevron flecks sit on the ring edges, pointing outward, to sell the push.
This must read as CONCENTRIC ANGULAR RINGS PUSHING OUTWARD FROM AN EMPTY CENTER. Do NOT draw a
filled disc. Do NOT draw a solid glowing blob in the middle. Do NOT draw a circular ring — the
rings must be visibly HEXAGONAL with straight edges. Do NOT draw ground cracks or fissures. Do
NOT draw a star burst or radial spikes from the center. Do NOT draw a shield object.

COLOR: brilliant white-hot along the ring edges, cool pale silver-white in the ring bodies,
hard-edged steel blue-grey at the outer rim and on the chevron flecks. Whites, silvers and cold
blue-greys only. No gold, no yellow, no orange, no red, no green, no purple.

FRAME ORDER, reading left-to-right then top-to-bottom. The rings START SMALL AND TIGHT and
EXPAND OUTWARD across the frames while fading:
  Frame 1 (row1 col1): One small tight hexagon outline at about 22% of cell width, moderately
                       bright. Center empty and black.
  Frame 2 (row1 col2): PEAK BRIGHTNESS. Hexagon at about 38% of cell width, thick and blazing
                       white. A second fainter hexagon just appearing inside it.
  Frame 3 (row1 col3): Rings at about 52% of cell width, very bright but slightly thinner.
                       Two clear concentric hexagons. Chevron flecks appear on the outer edge.
  Frame 4 (row2 col1): Rings at about 64%, brightness clearly down from the peak. Three
                       concentric hexagons now visible, the innermost faintest.
  Frame 5 (row2 col2): Rings at about 74%, noticeably dimmer and thinner.
  Frame 6 (row2 col3): Rings at about 82%, thin bright outlines only, corners starting to break.
  Frame 7 (row3 col1): Rings at about 88%, faint and broken into separate straight segments.
  Frame 8 (row3 col2): Only a few dim straight segments remain at about 92%, very faint.
  Frame 9 (row3 col3): Almost entirely black, a couple of dim corner glints at about 96%.

ABSOLUTE RULES:
1. Background is PURE BLACK #000000 everywhere, including between the cells.
2. EXACTLY 9 equal-size cells in a 3x3 grid. Every cell the same size.
3. NO borders, NO dividing lines, NO gutters, NO frames between cells.
4. The rings stay PERFECTLY CENTERED in their cell in all 9 frames and must not drift. Only
   their radius, thickness and brightness change.
5. Brightness must PEAK AT FRAME 2 and then decrease monotonically to frame 9. Do NOT make
   frame 5 or frame 9 the brightest.
6. The CENTER of every frame must stay PURE BLACK and EMPTY — never fill the middle with light.
7. The rings must be HEXAGONAL with straight segments and sharp corners, never smooth circles.
8. The effect must stay INSIDE its own cell, with a thin black margin at the cell edge. Nothing
   may bleed into a neighboring cell.
9. NO character, NO warrior, NO shield, NO weapon, NO armor, NO hand, NO body part, NO ground,
   NO grass, NO terrain, NO shadow. Only the abstract glowing light effect on black.
10. Flat 2D game VFX illustration. NO motion blur, NO smoke, NO dust, NO photographic depth of
    field. NO text, NO labels, NO numbers, NO UI, NO watermark anywhere.
