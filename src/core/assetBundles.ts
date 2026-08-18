import type { AssetBundleDef } from './AssetManager';

/**
 * Asset bundle definitions.
 * Paths are relative to the mini-game root (same folder as game.js).
 * Files must be placed there manually or via the generation pipeline
 * described in doc/GENERATE_ASSET_SPEC.md.
 */

// 没有 plain：平原格不画贴图，直接透出战斗背景（见 renderHelpers.createTerrainCell）。
export const TERRAIN_BUNDLE: AssetBundleDef = {
  name: 'terrain',
  assets: {
    high: 'images/terrain/high.png',
    forest: 'images/terrain/forest.png',
    river: 'images/terrain/river.png',
    swamp: 'images/terrain/swamp.png',
    wall: 'images/terrain/wall.png',
    abyss: 'images/terrain/abyss.png',
  },
};

export const UNIT_BUNDLE: AssetBundleDef = {
  name: 'unit',
  assets: {
    sword: 'images/units/sword.png',
    bow: 'images/units/bow.png',
    cavalry: 'images/units/cavalry.png',
    shield: 'images/units/shield.png',
    // 第一章杂兵 / 精英·Boss 专属外观，key = spawn 的 animSet（见 src/data/stagesMvp.ts）
    slime: 'images/units/slime.png',
    sporecap: 'images/units/sporecap.png',
    bloodwolf: 'images/units/bloodwolf.png',
    rockshell: 'images/units/rockshell.png',
    bloodfang: 'images/units/bloodfang.png',
  },
};

/**
 * 按钮和面板**没有贴图**：它们要在任意宽高下拉伸，而九宫格的四角必须像素级一致，
 * 生图模型给不了这个精度。扁平色块 + 粗描边这种风格用 Graphics 画更准也更省包体，
 * 见 `src/ui/Button.ts`。以前那三张 392x440 的 btn/panel 母版从未被任何代码引用，已删。
 */
export const UI_BUNDLE: AssetBundleDef = {
  name: 'ui',
  assets: {
    icon_gold: 'images/ui/icon_gold.png',
    icon_deploy: 'images/ui/icon_deploy.png',
    icon_terrain: 'images/ui/icon_terrain.png',
    icon_gear: 'images/ui/icon_gear.png',
    // 三种药剂共用同一个瓶型，只有液体颜色不同，键名对齐 POTION_DEFS 的 id
    icon_potion_heal: 'images/ui/icon_potion_heal.png',
    icon_potion_draught: 'images/ui/icon_potion_draught.png',
    icon_potion_slow: 'images/ui/icon_potion_slow.png',
    // 魂晶：唯一的永久货币。金币是局内的，两者的图标和颜色不许混用
    icon_soul: 'images/ui/icon_soul.png',
    icon_lock: 'images/ui/icon_lock.png',
    // 节点进度条上的补给点与 Boss 点，直径只有 20px
    node_supply: 'images/ui/node_supply.png',
    node_boss: 'images/ui/node_boss.png',
    // 底部导航。曾对齐 TabId，招募 tab 暂时借用 tab_shop（欠一张专门的招募图标）；
    // 背包 tab 已删，tab_inventory 随之下架
    tab_shop: 'images/ui/tab_shop.png',
    tab_roster: 'images/ui/tab_roster.png',
    tab_adventure: 'images/ui/tab_adventure.png',
    tab_challenge: 'images/ui/tab_challenge.png',
    logo_emblem: 'images/ui/logo_emblem.png',
    // 战斗胜利弹窗的标题横幅。图里刻意留空——「胜利」两个字用游戏字体在代码里画，
    // 烧进贴图的话既换不了文案，字形也和界面其余部分对不上。
    banner_victory: 'images/ui/banner_victory.png',
    // 技能词条图标，键名 = SkillModDef.icon（见 src/data/skillModCatalog.ts）。
    // **普通词条一条一张**；专属词条不各配图，十八条共用 mod_signature 徽记——
    // 卡面正中已经是那一招的技能大图了，理由见《美术风格圣经》§6.1。
    mod_sharpen: 'images/ui/mod_sharpen.png',
    mod_quick: 'images/ui/mod_quick.png',
    mod_rout: 'images/ui/mod_rout.png',
    mod_hobble: 'images/ui/mod_hobble.png',
    mod_venom: 'images/ui/mod_venom.png',
    mod_siphon: 'images/ui/mod_siphon.png',
    mod_fury: 'images/ui/mod_fury.png',
    mod_wide: 'images/ui/mod_wide.png',
    mod_overwhelm: 'images/ui/mod_overwhelm.png',
    mod_guard: 'images/ui/mod_guard.png',
    mod_haste: 'images/ui/mod_haste.png',
    mod_splash: 'images/ui/mod_splash.png',
    mod_execute: 'images/ui/mod_execute.png',
    mod_momentum: 'images/ui/mod_momentum.png',
    mod_bloodthirst: 'images/ui/mod_bloodthirst.png',
    mod_relentless: 'images/ui/mod_relentless.png',
    mod_lasting: 'images/ui/mod_lasting.png',
    mod_blessing: 'images/ui/mod_blessing.png',
    mod_mend: 'images/ui/mod_mend.png',
    mod_signature: 'images/ui/mod_signature.png',
    // 技能图标，键名 = `skill_` + SkillSpec.id（见 src/data/skillCatalog.ts）。
    // 三选一卡片按 `skill_${skillId}` 直接拼 key，所以**加技能必须同步加图标**，
    // 漏了会退成灰色占位圆，由 skillIcons.test.ts 守着。
    skill_whirl: 'images/ui/skill_whirl.png',
    skill_pierce: 'images/ui/skill_pierce.png',
    skill_charge: 'images/ui/skill_charge.png',
    skill_bash: 'images/ui/skill_bash.png',
    skill_blade_rush: 'images/ui/skill_blade_rush.png',
    skill_cleave: 'images/ui/skill_cleave.png',
    skill_lance_thrust: 'images/ui/skill_lance_thrust.png',
    skill_trample: 'images/ui/skill_trample.png',
    skill_snap: 'images/ui/skill_snap.png',
    skill_hex_mark: 'images/ui/skill_hex_mark.png',
    skill_hammer: 'images/ui/skill_hammer.png',
    skill_shield_wall: 'images/ui/skill_shield_wall.png',
    skill_war_shout: 'images/ui/skill_war_shout.png',
    skill_field_bless: 'images/ui/skill_field_bless.png',
    skill_temp_gl_snare: 'images/ui/skill_temp_gl_snare.png',
    skill_temp_gl_salve: 'images/ui/skill_temp_gl_salve.png',
    skill_temp_gl_swarm: 'images/ui/skill_temp_gl_swarm.png',
    skill_temp_gl_horn: 'images/ui/skill_temp_gl_horn.png',
    skill_temp_fo_torch: 'images/ui/skill_temp_fo_torch.png',
    skill_temp_fo_thorn: 'images/ui/skill_temp_fo_thorn.png',
    skill_temp_fo_bark: 'images/ui/skill_temp_fo_bark.png',
    skill_temp_fo_warden: 'images/ui/skill_temp_fo_warden.png',
    skill_temp_ft_ram: 'images/ui/skill_temp_ft_ram.png',
    skill_temp_ft_suppress: 'images/ui/skill_temp_ft_suppress.png',
    skill_temp_ft_banner: 'images/ui/skill_temp_ft_banner.png',
    skill_temp_ft_grapple: 'images/ui/skill_temp_ft_grapple.png',
    // 敌方技能皮肤图标（键名见 enemySkillCatalog.iconKey，不进玩家商店池）
    skill_bloodfang_roar: 'images/ui/skill_bloodfang_roar.png',
    skill_bloodfang_wildfire: 'images/ui/skill_bloodfang_wildfire.png',
    skill_bloodfang_breach: 'images/ui/skill_bloodfang_breach.png',
    // 战斗操作条的动作图标。压在深色圆按钮上，所以这批是**浅色填充**，
    // 和压在米白卡上的那两批（mod_* / skill_*）配色相反，不要互相借用。
    act_wait: 'images/ui/act_wait.png',
    act_undo: 'images/ui/act_undo.png',
    act_cancel: 'images/ui/act_cancel.png',
    act_attack: 'images/ui/act_attack.png',
    // 局内补给点场景：神秘商人 + 木摊（ShopView）
    shop_merchant: 'images/ui/shop_merchant.png',
    shop_stall: 'images/ui/shop_stall.png',
  },
};

export const FX_BUNDLE: AssetBundleDef = {
  name: 'fx',
  assets: {
    slash: 'images/fx/slash.png',
    arrow: 'images/fx/arrow.png',
    shield_bash: 'images/fx/shield_bash.png',
    whirlwind: 'images/fx/whirlwind.png',
    // 飞行弹体 / 实体道具：抠图 + 普通混合，靠剪影认是什么。发光拖尾/命中另走 additive
    proj_arrow: 'images/fx/proj_arrow.png',
    proj_spear: 'images/fx/proj_spear.png',
    proj_bees: 'images/fx/proj_bees.png',
    prop_horn: 'images/fx/prop_horn.png',
    prop_salve: 'images/fx/prop_salve.png',
  },
};

export const BG_BUNDLE: AssetBundleDef = {
  name: 'bg',
  assets: {
    battle_bg: 'images/bg/battle_bg.png',
    // 补给点场景底：平视草地空地（商人正视，不能用俯视 battle_bg）
    shop_bg: 'images/bg/shop_bg.png',
    // 章节卡插图，key 对应 DungeonDef.art
    chapter_grassland: 'images/bg/chapter_grassland.png',
  },
};

/** 启动页专用：随包底图，必须先于其它 bundle 加载，避免 Logo 闪入 */
export const LOADING_BUNDLE: AssetBundleDef = {
  name: 'loading',
  assets: {
    splash: 'images/ui/loading/loading_splash.jpg',
  },
};

export const ALL_BUNDLES: AssetBundleDef[] = [
  TERRAIN_BUNDLE,
  UNIT_BUNDLE,
  UI_BUNDLE,
  FX_BUNDLE,
  BG_BUNDLE,
];
