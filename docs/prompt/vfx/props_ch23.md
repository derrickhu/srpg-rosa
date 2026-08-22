# 第二、三章实体道具三件套（prop_torch / prop_ram / prop_banner）—— 绿幕抠图单图

- 用途：`FX_BUNDLE` 里的静态抠图道具，由 `propBurst`（火把、战旗）和 `travel.sprite`（撞城槌）引用。
- 切图：`python3 scripts/cutout-chroma.py --key green --cuts <x1> <x2>`（三件挤在一张图上，
  没有干净的绿色分界，所以按列显式切）。
- 三件都是**普通混合**的实体，不发光。

## 为什么要做这一族

玩家点名说号角那一招「比较有特点」。查下去，号角的特点不来自它那圈光——那套图集其实
根本没被配方引用过（已作为死资产摘掉）——而来自 `prop_horn` 那支**看得见的号**。
一个能叫出名字的东西比一团抽象的光好认得多，而且天然和技能名对得上。

所以第二、三章的招牌临时技能按这条配方各补一件道具：松脂火把、撞城槌、攻城战旗。
`prop_ram` 同时替掉了从前撞城槌误用的 `proj_spear`——矛是刺的，槌是钝的，
而「钝」正是撞城槌的性格。

键色用绿：三件都是暖色（木、铁、红旗），主体里没有饱和绿。

## Prompt

CRITICAL BACKGROUND REQUIREMENT: the background must be PURE SATURATED GREEN #00FF00. Every pixel
that is not part of an object must be pure chroma green. No shadows on the background, no gradient,
no vignette, no glow. This is a chroma-key cutout: green is what gets deleted. Do NOT use any green
anywhere in the objects themselves.

One WIDE image containing THREE separate medieval siege props side by side, evenly spaced, with a
clear band of pure green between each one. All three drawn in the same flat 2D game-asset style,
same lighting from the upper left, hard opaque edges.

LEFT — A PINE-RESIN TORCH held at a diagonal (handle at lower left, burning head at upper right):
  thick wooden handle wrapped with dark cloth strips and twine, a metal collar, and a bundle of
  resin-soaked rags at the top burning with a compact orange flame. Warm browns, dark cloth,
  white-hot flame core to deep orange tips.

CENTER — A BATTERING RAM lying HORIZONTALLY, blunt head pointing RIGHT:
  a thick tree-trunk beam with visible wood grain, THREE iron bands with rivets wrapped around it,
  rope handles hanging below, and a heavy BLUNT iron cap on the right end. The cap must be flat and
  blunt, absolutely NOT pointed, NOT a spear tip, NOT a ram's horned head.
  Dark tobacco-brown wood, dark gunmetal bands with pale steel highlights.

RIGHT — A SIEGE WAR BANNER planted in the ground, cloth unfurling to the RIGHT:
  a tall wooden pole with an iron spike base and a small finial on top, carrying a deep crimson
  banner with a torn SWALLOW-TAIL edge on the right, gold trim along the top, and soft folds.
  Deep red cloth, aged gold trim, dark wood pole. NO heraldic emblem, NO letters, NO numbers.

ABSOLUTE RULES:
1. Background PURE GREEN #00FF00 everywhere, including the bands between the three objects.
2. EXACTLY three objects, clearly separated, none overlapping or touching another.
3. Each object fully INSIDE the image with a green margin on all sides.
4. NO character, NO hand, NO ground, NO shadow, NO text, NO watermark, NO emblem.
5. Flat 2D game asset style, hard opaque edges. NO motion blur, NO bloom, NO depth of field.
