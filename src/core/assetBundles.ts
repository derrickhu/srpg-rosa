import type { AssetBundleDef } from './AssetManager';

/**
 * Asset bundle definitions.
 * Paths are relative to the mini-game root (same folder as game.js).
 * Files must be placed there manually or via the generation pipeline
 * described in doc/GENERATE_ASSET_SPEC.md.
 */

// 没有 plain：平原格不画贴图，直接透出战斗背景（见 renderHelpers.createTerrainCell）。
//
// 多状态地形必须每态一张。森林被点燃后变成 burning、烧尽变成 scorched；
// 闸门从 gate_closed 变成 gate_open。漏登记的表现是那一格突然变成纯色方块
// （`createTerrainCell` 走不到纹理就用 `terrainSpec.color`），玩家会以为着火/开门没发生。
export const TERRAIN_BUNDLE: AssetBundleDef = {
  name: 'terrain',
  assets: {
    high: 'images/terrain/high.png',
    forest: 'images/terrain/forest.png',
    river: 'images/terrain/river.png',
    swamp: 'images/terrain/swamp.png',
    wall: 'images/terrain/wall.png',
    abyss: 'images/terrain/abyss.png',
    burning: 'images/terrain/burning.png',
    scorched: 'images/terrain/scorched.png',
    lever: 'images/terrain/lever.png',
    gate_closed: 'images/terrain/gate_closed.png',
    gate_open: 'images/terrain/gate_open.png',
  },
};

export const UNIT_BUNDLE: AssetBundleDef = {
  name: 'unit',
  assets: {
    sword: 'images/units/sword.png',
    bow: 'images/units/bow.png',
    cavalry: 'images/units/cavalry.png',
    shield: 'images/units/shield.png',
    mage: 'images/units/mage.png',
    healer: 'images/units/healer.png',
    floe: 'images/units/floe.png',
    // 杂兵 / 精英·Boss 专属外观，key = spawn 的 animSet（见 src/data/stagesMvp.ts）。
    // 每章一批，图鉴见 docs/敌人图鉴.md。漏登记的表现是布阵格里那只怪只剩一个阵营色圆圈。
    // 第一章 · 草原野地魔物
    slime: 'images/units/slime.png',
    sporecap: 'images/units/sporecap.png',
    bloodwolf: 'images/units/bloodwolf.png',
    rockshell: 'images/units/rockshell.png',
    // 第二章 · 密林腐生植物
    vinecocoon: 'images/units/vinecocoon.png',
    sporesac: 'images/units/sporesac.png',
    leafpanther: 'images/units/leafpanther.png',
    mosswarden: 'images/units/mosswarden.png',
    // 第三章 · 要塞兽人守军
    fangtrooper: 'images/units/fangtrooper.png',
    wallbalist: 'images/units/wallbalist.png',
    wallrider: 'images/units/wallrider.png',
    gatewarden: 'images/units/gatewarden.png',
    // 第四章 · 毒沼节肢
    mirehand: 'images/units/mirehand.png',
    dartbug: 'images/units/dartbug.png',
    miregator: 'images/units/miregator.png',
    mudcarapace: 'images/units/mudcarapace.png',
    // 第五章 · 龙岭火山属
    magmacore: 'images/units/magmacore.png',
    emberbat: 'images/units/emberbat.png',
    scalewyrm: 'images/units/scalewyrm.png',
      ashshell: 'images/units/ashshell.png',
      // 第二至五章 · 血牙部族精英（第一章精英沿用 bloodfang）
      torun: 'images/units/torun.png',
      castellan: 'images/units/castellan.png',
      mirespeaker: 'images/units/mirespeaker.png',
      drakekin: 'images/units/drakekin.png',
      // Boss
      bloodfang: 'images/units/bloodfang.png',
      bloodshaman: 'images/units/bloodshaman.png',
      bloodcastellan: 'images/units/bloodcastellan.png',
      mirequeen: 'images/units/mirequeen.png',
      drakelord: 'images/units/drakelord.png',
  },
};

/**
 * 大厅壳（卡框 / 绶带 / 金按钮皮 / 金台 / 副本插图）是画出来的贴图，
 * 由 `src/ui/chrome.ts` 做九宫格拉伸。战场上的矮按钮、信息条仍走 Graphics：
 * 那些控件太矮，角花会被压扁。
 */
export const UI_BUNDLE: AssetBundleDef = {
  name: 'ui',
  assets: {
    icon_gold: 'images/ui/icon_gold.png',
    // 大厅壳。键名对齐 chrome.ts
    frame_panel: 'images/ui/frame_panel.png',
    ribbon_title: 'images/ui/ribbon_title.png',
    // 大厅四页标题底。图里留空，页名用系统字叠上去，四张外形和主色都不同。
    title_recruit: 'images/ui/title_recruit.png',
    title_roster: 'images/ui/title_roster.png',
    title_adventure: 'images/ui/title_adventure.png',
    title_challenge: 'images/ui/title_challenge.png',
    btn_primary_skin: 'images/ui/btn_primary_skin.png',
    platform_gold: 'images/ui/platform_gold.png',
    illust_endless: 'images/ui/illust_endless.png',
    illust_hunt: 'images/ui/illust_hunt.png',
    illust_boss: 'images/ui/illust_boss.png',
    illust_repeat: 'images/ui/illust_repeat.png',
    roster_card: 'images/ui/roster_card.png',
    roster_card_locked: 'images/ui/roster_card_locked.png',
    icon_deploy: 'images/ui/icon_deploy.png',
    icon_terrain: 'images/ui/icon_terrain.png',
    icon_gear: 'images/ui/icon_gear.png',
    // 战斗底部托管开关。只出剪影，圆钮壳和「托管 / 接手」字在回放层画。
    icon_pilot_auto: 'images/ui/icon_pilot_auto.png',
    icon_pilot_take: 'images/ui/icon_pilot_take.png',
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
    // 底部导航。背包 tab 已删，tab_inventory 随之下架
    tab_shop: 'images/ui/tab_shop.png',
    tab_recruit: 'images/ui/tab_recruit.png',
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
    skill_ember: 'images/ui/skill_ember.png',
    skill_flame_ring: 'images/ui/skill_flame_ring.png',
    skill_frost_ring: 'images/ui/skill_frost_ring.png',
    skill_heal_touch: 'images/ui/skill_heal_touch.png',
    skill_ward_prayer: 'images/ui/skill_ward_prayer.png',
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
    skill_mirequeen_miasma: 'images/ui/skill_mirequeen_miasma.png',
    skill_drake_cataclysm: 'images/ui/skill_drake_cataclysm.png',
    // 杂兵技能图标。这一批**没有皮肤**，直接按底层 SkillSpec id 挂在怪种上
    // （`stagesMvp` 的 `MookTemplate.skillId`），所以键名是 `skill_<specId>`
    // 而不是 `skill_<skinId>`。少登记一个的表现是面板上一个灰圆，不报错。
    skill_spore_spray: 'images/ui/skill_spore_spray.png',
    skill_wall_ram: 'images/ui/skill_wall_ram.png',
    skill_venom_dart: 'images/ui/skill_venom_dart.png',
    skill_mire_bite: 'images/ui/skill_mire_bite.png',
    skill_magma_burst: 'images/ui/skill_magma_burst.png',
    skill_cinder_breath: 'images/ui/skill_cinder_breath.png',
    skill_wyrm_dash: 'images/ui/skill_wyrm_dash.png',
    skill_ash_harden: 'images/ui/skill_ash_harden.png',
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
    //
    // 弓手三招各有一支箭。原先三招共用一张 `proj_arrow`，只靠命中闪光区分，
    // 而弹体在屏幕上停留的时间比命中闪光长得多，所以玩家看到的其实是「同一支箭飞三次」。
    // 弹体是这类技能最显眼的部件，一支箭一副样子比换命中特效划算。
    /** 普攻：短小的木猎箭。最弱的一下就该看起来最朴素 */
    proj_arrow_wood: 'images/fx/proj_arrow_wood.png',
    /** 穿透箭：加长破甲重箭，长锥箭镞 + 杆上一道冷青能量，读作「扎穿一条线」 */
    proj_arrow_heavy: 'images/fx/proj_arrow_heavy.png',
    /** 速射：极短的轻镖箭，后掠箭羽表达速度 */
    proj_arrow_snap: 'images/fx/proj_arrow_snap.png',
    proj_holy: 'images/fx/proj_holy.png',
    /**
     * 实体道具。这一族的存在理由是玩家自己给的：号角「比较有特点」，
     * 而特点来自那支**看得见的号**，不是它那圈光环——
     * 一个能叫出名字的东西比一团抽象的光好认得多，也天然和技能名对得上。
     * 所以第二、三章的招牌临时技能都按这条配方补了道具。
     *
     * `fx` 是整包加载（`loadBundle`），所以这里的每一条都实打实占下载量。
     * 删掉的两条正是被这一轮取代的死条目：
     * `proj_bees` 一张静图（换成 `swarm_bees` 六帧扰动动画）、
     * `proj_spear` 一根矛（撞城槌不是刺的，换成 `prop_ram`）。
     */
    prop_horn: 'images/fx/prop_horn.png',
    prop_salve: 'images/fx/prop_salve.png',
    /** 松脂火把：斜举的树脂火把，柄上缠布、顶端燃烧 */
    prop_torch: 'images/fx/prop_torch.png',
    /** 撞城槌：横置槌身 + 三道铁箍 + 钝槌头朝右。钝，不是尖的 */
    prop_ram: 'images/fx/prop_ram.png',
    /** 攻城战旗：旗杆插地、旗面朝右展开、燕尾撕口 */
    prop_banner: 'images/fx/prop_banner.png',
  },
};

export const BG_BUNDLE: AssetBundleDef = {
  name: 'bg',
  assets: {
    battle_bg: 'images/bg/battle_bg.png',
    battle_bg_forest: 'images/bg/battle_bg_forest.png',
    battle_bg_fortress: 'images/bg/battle_bg_fortress.png',
    battle_bg_swamp: 'images/bg/battle_bg_swamp.png',
    battle_bg_dragon: 'images/bg/battle_bg_dragon.png',
    // 旧四页共用底，留给未改到的入口兜底
    hub_bg: 'images/bg/hub_bg.png',
    recruit_bg: 'images/bg/recruit_bg.png',
    roster_bg: 'images/bg/roster_bg.png',
    adventure_bg: 'images/bg/adventure_bg.png',
    challenge_bg: 'images/bg/challenge_bg.png',
    // 角色获得亮相厅
    reveal_hall: 'images/bg/reveal_hall.png',
    // 补给点场景底：平视草地空地（商人正视，不能用俯视 battle_bg）
    shop_bg: 'images/bg/shop_bg.png',
    // 章节卡插图，key 对应 DungeonDef.art
    chapter_grassland: 'images/bg/chapter_grassland.png',
    chapter_forest: 'images/bg/chapter_forest.png',
    chapter_fortress: 'images/bg/chapter_fortress.png',
    chapter_swamp: 'images/bg/chapter_swamp.png',
    chapter_dragon: 'images/bg/chapter_dragon.png',
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
