# 霜噬叠层（frost_burst）—— 黑底 additive 竖向霜晶 6 帧（2x3 网格）

- 用途：霜噬（`ex_flame_ignite`）给目标挂冻伤时，命中叠层 `FROST_HIT_VFX`。
- 色相：霜冰（白核 / #A8D4FF / #3A7AB8）。
- 形态：**身上长出一丛竖着的冰棱**，从胸口往上戳。
  **禁止圆环、禁止放射星、禁止冲击波环、禁止紫雾。**

中毒叠层是 `poison_burst` 的竖向毒烟。冻伤不能再穿那张紫雾——描述已经改成霜噬。
也不能做成 `frost_ring` 的顶视环，否则和招牌技能撞形态。

## Prompt

The attached reference is STYLE ONLY (black-bg additive game VFX: bright core, hard graphic
edges, no photo blur). Produce a NEW 2x3 grid, not a copy of the reference layout.

CRITICAL BACKGROUND: PURE BLACK #000000 everywhere. Additive VFX — black becomes invisible.

A 2x3 sprite sheet (2 rows, 3 columns), 6 frames of VERTICAL ICE CRYSTALS growing on a person.

THIS IS A CLUSTER OF SPIKES GROWING UP, NOT AN EXPLOSION AND NOT A RING.
- Seen as if standing in front of the character (slight 3/4, still flat 2D).
- Jagged ice prisms GROW UPWARD from the lower-center of each cell (the character's chest).
- Wider and more broken toward the TOP, rooted at the BOTTOM. Like frost blooming on a body.
- NO circular ring. NO expanding halo. NO radial star. NO shockwave circle. NO top-down flower.
- NO purple smoke. These are hard crystal shards, not a plume of gas.

COLOR: frost-white #F7FBFF at the brightest facets, ice-blue #A8D4FF in the body of the
crystals, deep cobalt #3A7AB8 at the thinning edges. No fire, no orange, no purple, no pink.

FRAME ORDER (left-to-right, then top-to-bottom):
  1: A short cluster of ice spikes just appearing on the body, about 25% of cell height, still
     narrow.
  2: PEAK. Tall crystals reaching ~70% of cell height, branching sideways as they rise. Still a
     vertical cluster, not a ring.
  3: Cluster still tall, upper shards more broken, base still on the body.
  4: Upper crystals thinning and shattering upward, cluster shorter and torn.
  5: Only faint rising ice chips, mostly the top half of the cell.
  6: A few dim ice-blue shards near the top. Almost black.

ABSOLUTE RULES:
1. PURE BLACK background, including gutters. No borders, no labels, no watermark.
2. EXACTLY 6 equal cells, 2x3. Effect stays inside its cell.
3. The BASE of the crystals stays near the vertical center of the cell (character chest) in
   every frame. The ice grows UP, it does not expand as a circle around the center.
4. No rings. If you draw a circle or halo, the frame is wrong.
5. Flat 2D game VFX. No motion blur, no photoreal frost photography, no character, no weapon,
   no ground.
