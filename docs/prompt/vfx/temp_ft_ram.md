# 撞城槌（temp_ft_ram）命中段 —— 黑底 additive 钝击冲击 9 帧（3x3 网格）

- 技能：`temp_ft_ram`（直线冲撞，攻城主题）。
- 运行时：`SKILL_VFX.temp_ft_ram.impact`；弹道段是抠图道具 `prop_ram`（见 `props_ch23.md`）。
- 切帧：`python3 scripts/vfx-sheet.py --key black --align center --alpha-gamma 2.0`。
- 图集：`blend: 'add'`。

## 为什么重做

从前这一招的拖尾借的是 `ember_wave`——一个**火**特效。撞城槌是木头包铁的攻城器械，
砸出来的是碎石和尘，不是火。名字和画面不搭是玩家最先看出来的那类问题。

顺带修掉的还有弹体：从前用 `proj_spear`（一根矛）。矛是**刺**的，槌是**钝**的，
这个区别正是撞城槌的全部性格。现在弹体换成 `prop_ram`——横置槌身、三道铁箍、钝头朝右。

形态上守两条：**有方向**（技能是直线冲撞，冲击必须朝一侧偏），**是钝的**（宽而扁的弧面，
不是尖锥）。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE BLACK #000000. Every pixel that is not
part of the impact must be absolutely black. No dark grey, no navy, no gradient, no vignette, no
smoke, no glow bleeding into the corners. This is an additive blend effect and black is what becomes
invisible in the game.

A 3x3 sprite sheet (3 rows, 3 columns) showing 9 frames of a BLUNT SIEGE-RAM IMPACT — a heavy,
DIRECTIONAL shockwave crescent pointing RIGHT, with stone chips flying, seen from a
slightly HIGH THREE-QUARTER angle.

SHAPE: a WIDE, FLAT, BLUNT crescent arc bulging to the RIGHT (the direction of the charge), thickest
at its middle and tapering at both ends. Behind it, short straight speed lines pointing right.
Around it, angular STONE CHIPS and dust motes flung mostly rightward and upward. The crescent must
read as a heavy blunt smash, NOT a sharp pierce, NOT a full ring, NOT a slash arc, NOT a fireball.
The effect is ASYMMETRIC — the left side stays much emptier than the right.

COLOR: pale bone-white core → warm dust ochre → dark grey-brown chips. A cold grey-steel tint on the
speed lines. NO fire orange as the dominant color. NO green. NO blue. NO purple.

FRAME ORDER, left-to-right then top-to-bottom. Impact LANDS then DISSIPATES:
  Frame 1: A thin bright compression line on the right, very small.
  Frame 2: Line bows into a small crescent, first chips appear.
  Frame 3: Crescent grows, brighter core, more chips.
  Frame 4: PEAK — widest brightest blunt crescent, chips flung far right.
  Frame 5: Crescent begins flattening, dust expands, chips travel outward.
  Frame 6: Crescent breaking up, dust dominant.
  Frame 7: Ragged dust arc, chips falling.
  Frame 8: Faint dust smear, a few dim chips.
  Frame 9: Almost black; a couple of dim ochre motes.

ABSOLUTE RULES:
1. Background PURE BLACK #000000 everywhere, including between cells.
2. EXACTLY 9 equal cells in a 3x3 grid. NO borders, NO gutters, NO frames between cells.
3. The crescent's ORIGIN stays at the same spot in every cell — it must not drift; only the arc grows.
4. Keep the direction consistently RIGHT in all 9 frames.
5. Stay INSIDE each cell; leave a thin black margin even on frame 4.
6. NO character, NO ram prop, NO wall, NO ground, NO text, NO watermark.
7. Flat 2D game VFX. NO photographic smoke, NO motion blur.
