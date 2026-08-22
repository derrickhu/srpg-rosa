#!/usr/bin/env node
/**
 * sprite2anim —— 把 generate2dsprite 的处理产物转成 Pixi 图集 + 动画清单。
 *
 * 这是 tres2pixi 的兄弟路线：同样产出 images/anim/<id>.png 与 src/data/anim/<id>.json
 * （共用 lib/animAtlas.mjs），但源头是 AI 生图 + 确定性后处理，不经过 Godot。
 *
 * 上游流程（每个动作一次 process，产物落在 art/sprite-runs/<id>/<action>/）：
 *   1. 用内置生图产出品红底(#FF00FF)网格图 —— 角色主色偏暖红/紫时改用绿底，
 *      见 docs/美术管线-AI-sprite.md
 *   2. python3 ~/.cursor/skills/generate2dsprite/scripts/generate2dsprite.py process \
 *        --input raw.png --target player --mode player_sheet \
 *        --output-dir art/sprite-runs/<id>/walk \
 *        --align feet --shared-scale --component-mode largest --strict-qc \
 *        --write-scale-profile art/sprite-runs/<id>/scale-profile.json
 *   3. 后续动作复用同一个 profile：--scale-profile art/sprite-runs/<id>/scale-profile.json
 *
 * 用法：node scripts/sprite2anim.mjs [--only <id>]  （或 npm run anim:build:sprite）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { flipH, hasPngquant, measureBody, resampleAbout, writeAnimSet } from './lib/animAtlas.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RUNS_DIR = 'art/sprite-runs';
/** 黑底 additive 特效不走抠色，产物由 scripts/vfx-sheet.py 落在这里 */
const VFX_RUNS_DIR = 'art/vfx-runs';

/**
 * 要转换的资源集合。
 *
 * vfx            true 表示产物目录在 art/vfx-runs/（黑底 additive 特效），否则在 art/sprite-runs/
 * runs[].dir     相对上述目录的处理产物目录（含 pipeline-meta.json 与逐帧 PNG）
 * runs[].preset  见下方 PRESETS，决定帧标签如何映射成我们的动画名
 * runs[].facing  attack/hurt 这类按朝向分别生成的动作，指定 up|down|left|right
 * runs[].fps     覆盖 preset 默认帧率
 * runs[].as      覆盖输出动画名（fx/impact/vfx 这类单动画 preset 用）
 * runs[].frames  vfx preset 专用：帧数
 * runs[].label   single preset 专用：取产物目录里的哪一帧（一张多怪的 sheet 每只取一帧）
 * source         产物溯源字符串，默认 <baseDir>/<id>；多个集合共用一个产物目录时手动指定
 * runs[].mirror  attack 专用：整段动作水平镜像。左右向挥砍互为镜像，生图只做一侧更省。
 * runs[].mirrorRight  player_sheet 专用：walk_right 由 left 行水平镜像得到，忽略 right 行。
 *                     生图模型很难可靠地把第三行画成第二行的镜像，而镜像本身是确定性操作，
 *                     交给代码比重摇生图划算。转身换持械手是合理的，不算持械手漂移。
 * downscale      源帧整数降采样倍数。process 的 --cell-size 已经决定了原生帧尺寸，
 *                通常留 1；只在想复用大 cell 产物又要减体积时才降。
 */
const SETS = [
  // 角色集合 id 通常等于单位的 defId（= 职业，见 src/data/stagesMvp.ts 的 UnitKind）；
  // Boss/精英复用职业 defId 拿数值，但用 spawn 的 animSet 字段指向自己的集合。
  // 我方/敌方共用的四职业（UnitKind）。四套都走同一条 prompt 约定：风格段落取
  // docs/prompt/_style_block.txt，行走段落取 _walk_motion_block.txt，攻击每方向一张 2x2。
  // 右向一律由左向镜像，所以行走 sheet 第 3 行、attack_right 都不单独出图。
  {
    id: 'bow',
    blend: 'normal',
    downscale: 1,
    runs: [
      { dir: 'bow/walk', preset: 'player_sheet', fps: 10, mirrorRight: true },
      { dir: 'bow/walk', preset: 'idle_from_walk', mirrorRight: true },
      { dir: 'bow/attack_down', preset: 'attack', facing: 'down', fps: 12 },
      { dir: 'bow/attack_left', preset: 'attack', facing: 'left', fps: 12 },
      { dir: 'bow/attack_left', preset: 'attack', facing: 'right', fps: 12, mirror: true },
      { dir: 'bow/attack_up', preset: 'attack', facing: 'up', fps: 12 },
    ],
  },
  {
    id: 'shield',
    blend: 'normal',
    downscale: 1,
    runs: [
      { dir: 'shield/walk', preset: 'player_sheet', fps: 9, mirrorRight: true },
      { dir: 'shield/walk', preset: 'idle_from_walk', mirrorRight: true },
      { dir: 'shield/attack_down', preset: 'attack', facing: 'down', fps: 12 },
      { dir: 'shield/attack_left', preset: 'attack', facing: 'left', fps: 12 },
      { dir: 'shield/attack_left', preset: 'attack', facing: 'right', fps: 12, mirror: true },
      { dir: 'shield/attack_up', preset: 'attack', facing: 'up', fps: 12 },
    ],
  },
  {
    id: 'cavalry',
    blend: 'normal',
    downscale: 1,
    runs: [
      { dir: 'cavalry/walk', preset: 'player_sheet', fps: 11, mirrorRight: true },
      { dir: 'cavalry/walk', preset: 'idle_from_walk', mirrorRight: true },
      { dir: 'cavalry/attack_down', preset: 'attack', facing: 'down', fps: 12 },
      { dir: 'cavalry/attack_left', preset: 'attack', facing: 'left', fps: 12 },
      { dir: 'cavalry/attack_left', preset: 'attack', facing: 'right', fps: 12, mirror: true },
      { dir: 'cavalry/attack_up', preset: 'attack', facing: 'up', fps: 12 },
    ],
  },
  // 剑士 v3：prompt 见 docs/prompt/unit_sword_v3_*.txt。
  // 取代 Godot 手搭那版（原在 tres2pixi 的 SETS，已删）。攻击四向齐全，不像 bloodfang 省了 up。
  {
    id: 'sword',
    blend: 'normal',
    downscale: 1,
    runs: [
      { dir: 'sword/walk', preset: 'player_sheet', fps: 10, mirrorRight: true },
      { dir: 'sword/walk', preset: 'idle_from_walk', mirrorRight: true },
      { dir: 'sword/attack_down', preset: 'attack', facing: 'down', fps: 12 },
      { dir: 'sword/attack_left', preset: 'attack', facing: 'left', fps: 12 },
      { dir: 'sword/attack_left', preset: 'attack', facing: 'right', fps: 12, mirror: true },
      { dir: 'sword/attack_up', preset: 'attack', facing: 'up', fps: 12 },
    ],
  },
  // 法师 v2：四向走 + 杖击。prompt 见 docs/prompt/unit_mage_v2_*.txt。右向由左向镜像。
  {
    id: 'mage',
    blend: 'normal',
    downscale: 1,
    runs: [
      { dir: 'mage/walk', preset: 'player_sheet', fps: 10, mirrorRight: true },
      { dir: 'mage/walk', preset: 'idle_from_walk', mirrorRight: true },
      { dir: 'mage/attack_down', preset: 'attack', facing: 'down', fps: 12 },
      { dir: 'mage/attack_left', preset: 'attack', facing: 'left', fps: 12 },
      { dir: 'mage/attack_left', preset: 'attack', facing: 'right', fps: 12, mirror: true },
      { dir: 'mage/attack_up', preset: 'attack', facing: 'up', fps: 12 },
    ],
  },
  // 祭司 v1：prompt 见 docs/prompt/unit_healer_v1_*.txt。右向由左向镜像。
  {
    id: 'healer',
    blend: 'normal',
    downscale: 1,
    runs: [
      { dir: 'healer/walk', preset: 'player_sheet', fps: 10, mirrorRight: true },
      { dir: 'healer/walk', preset: 'idle_from_walk', mirrorRight: true },
      { dir: 'healer/attack_down', preset: 'attack', facing: 'down', fps: 12 },
      { dir: 'healer/attack_left', preset: 'attack', facing: 'left', fps: 12 },
      { dir: 'healer/attack_left', preset: 'attack', facing: 'right', fps: 12, mirror: true },
      { dir: 'healer/attack_up', preset: 'attack', facing: 'up', fps: 12 },
    ],
  },
  // 第一章 Boss 血牙酋长：stagesMvp 关 7 的 animSet: 'bloodfang'
  // attack_up 没单独生成，AnimatedUnit.playAttack 缺动画时会回退到 attack_right
  {
    id: 'bloodfang',
    blend: 'normal',
    downscale: 1,
    runs: [
      { dir: 'bloodfang/walk', preset: 'player_sheet', fps: 9, mirrorRight: true },
      { dir: 'bloodfang/walk', preset: 'idle_from_walk', mirrorRight: true },
      { dir: 'bloodfang/attack_down', preset: 'attack', facing: 'down', fps: 11 },
      { dir: 'bloodfang/attack_left', preset: 'attack', facing: 'left', fps: 11 },
      { dir: 'bloodfang/attack_left', preset: 'attack', facing: 'right', fps: 11, mirror: true },
    ],
  },
  // 第一章杂兵：四只魔物共用一张 2x2 生图（art/sprite-runs/mobs/raw-2x2.png），每只取一帧。
  // 一次出全套是为了让四只的描边粗细、简化程度、俯视角度天然一致；分四次生图做不到。
  // defId 仍是四个兵种，数值/克制/AI 全不动，只有外观换掉——见 stagesMvp 的 animSet。
  // 定位靠剪影读：圆滚水滴＝近战、宽伞盖＝远程、四足低伏＝快、厚穹顶＝坦。
  ...[
    { id: 'slime', label: 'mob-1' },
    { id: 'sporecap', label: 'mob-2' },
    { id: 'bloodwolf', label: 'mob-3' },
    { id: 'rockshell', label: 'mob-4' },
  ].map(({ id, label }) => ({
    id,
    source: `${RUNS_DIR}/mobs`,
    blend: 'normal',
    downscale: 1,
    runs: [{ dir: 'mobs/idle', preset: 'single', label }],
  })),
  // 黑底 additive 技能/命中特效，取用见 src/data/vfxCatalog.ts。
  //
  // 帧数与 fps 是两档标准，理由在 docs/特效圣经.md：
  //   命中类 6 帧 @24fps = 250ms —— 跟着伤害数字出现，长了就拖节奏；
  //   技能类 9 帧 @20fps = 450ms —— 要读成一个独立事件，短了会被当成普攻。
  //
  // `roar`：底层 savage_roar 的通用橙金冲击波（保留给未换皮的结算 id）。
  // `bloodfang_roar`：第一章 Boss 皮肤「血牙咆哮」——血红犬齿环，必须和 roar 形态可区分。
  // `bloodfang_wildfire`：第二章 Boss 皮肤「燎原咒火」——一圈竖直火柱，靠「向上生长」
  //   而不是「向外扩散」和上面两个环形区分（同部族两场 Boss 战，撞形态代价最大）。
  // `temp_gl_*`：第一章草原临时技能专属特效（缠足/敷治/蜂群/号角），形态互不撞车。
  ...[
    { id: 'roar', frames: 9, fps: 20 },
    { id: 'bloodfang_roar', frames: 9, fps: 20 },
    { id: 'bloodfang_wildfire', frames: 9, fps: 20 },
    { id: 'whirl', frames: 9, fps: 20 },
    { id: 'quake', frames: 9, fps: 20 },
    { id: 'pierce', frames: 9, fps: 20 },
    { id: 'arrow_hit', frames: 6, fps: 24 },
    { id: 'thrust', frames: 6, fps: 24 },
    { id: 'bash_hit', frames: 6, fps: 24 },
    { id: 'charge_aura', frames: 6, fps: 24 },
    { id: 'temp_gl_salve', frames: 9, fps: 20 },
    { id: 'ember_orb', frames: 6, fps: 16 },
    { id: 'ember_burst', frames: 6, fps: 24 },
    { id: 'ember_splat', frames: 6, fps: 24 },
    { id: 'ember_wave', frames: 6, fps: 20 },
    { id: 'flame_ring', frames: 9, fps: 20 },
    { id: 'holy_orb', frames: 6, fps: 16 },
    { id: 'holy_burst', frames: 6, fps: 24 },
    { id: 'holy_bolt', frames: 6, fps: 20 },
    { id: 'slash', frames: 6, fps: 24 },
    { id: 'heal_flash', frames: 9, fps: 20 },
    { id: 'ward_aegis', frames: 9, fps: 20 },
    { id: 'bless_rays', frames: 9, fps: 20 },
    // 补齐原先「没有配方、退回静态贴图」的六招。形态各自唯一，见 docs/特效圣经 §7：
    // 重劈=垂直劈裂、破阵斩=交叉双斩、速射=前向穿刺、铁锤=扁平砸地波、
    // 长驱突刺=螺旋钻刺、践踏=离散蹄印环（全库唯一一个不是环的 AoE）
    { id: 'cleave_slam', frames: 9, fps: 20 },
    { id: 'blade_x', frames: 9, fps: 22 },
    { id: 'snap_hit', frames: 9, fps: 24 },
    { id: 'hammer_smash', frames: 9, fps: 20 },
    { id: 'lance_pierce', frames: 9, fps: 20 },
    { id: 'trample_dust', frames: 9, fps: 20 },
    // 商店在卖但一直没有配方的两招。fps 都压到 16：
    // 盾墙震慑要让三层环推得看得清，破甲咒是零伤害技能（回放里连数字都不飘），
    // 必须让符印在敌人身上停住一会儿再裂，否则玩家以为这一发放空了
    { id: 'shield_wall', frames: 9, fps: 16 },
    { id: 'hex_mark', frames: 9, fps: 16 },
    // 18 帧/秒：挥砍要「快得像一刀」但又得让人看清刀身扫过的角度。
    // 再快刀身就糊了，等于回到单图运动
    { id: 'sword_swing', frames: 9, fps: 18 },
    // 第二、三章临时技能专属图。这两组原先全是借的（火把借法师炎环、绞缠借第一章缠足、
    // 庇护和守林人共用祭司的圣光盾、撞城槌的尾迹居然是火系的 ember_wave、
    // 压制借狂暴战吼、战旗借祭司祝福、钩索借骑兵冲锋光环），
    // 于是「每章的专属第二技能」在屏幕上全是别人的招。形态各自唯一，见 docs/特效圣经 §7：
    // 火把=四簇离散火苗（不是环）、绞缠=带刺藤蔓向内收网（全库唯一向内的）、
    // 庇护=木甲片自下包裹、守林人=脚下生根+头顶展冠（唯一的上下双段构图）、
    // 撞城槌=钝力新月向前推+石屑、压制=人字向下压（唯一向下的）、钩索=钩爪甩出+绳索绷紧
    { id: 'temp_fo_torch', frames: 9, fps: 18 },
    { id: 'temp_ft_ram', frames: 9, fps: 22 },
    { id: 'temp_ft_suppress', frames: 9, fps: 18 },
  ].map(({ id, frames, fps }) => ({
    id,
    vfx: true,
    blend: 'add',
    downscale: 1,
    runs: [{ dir: id, preset: 'vfx', as: id, frames, fps }],
  })),
  // ── 抠图**实体**特效：普通混合，不叠 additive 核心层 ────────────────────
  //
  // 和上面那一批的区别不是风格偏好，是**物理性质**：additive 的前提是「暗部即透明」，
  // 而这一批的东西本身不发光——藤蔓、树皮、根须、蜜蜂、铁钩都是物质。
  //
  // 走错这条路会同时坏两件事，两件都被量到过：
  // 1. 质感丢了。蜜蜂身上最有辨识度的是黑条纹，additive 把条纹整个吃掉，
  //    剩一团发光的黄雾。
  // 2. **在草地上根本看不见。** 战场草地是 RGB(202,225,54)、亮度 199，
  //    而 additive 管线按亮度烘 alpha，暗部一律变透明——于是 additive 素材
  //    只有亮部能显示，亮的绿又正好和草地重合。实测「自身像素中和草地色差 <60
  //    的比例」：野草缠足 64%、树皮庇护 63%、荆棘绞缠 53%、蜂群命中 52%、
  //    守林人 50%。同一个指标下走抠图的蜂群弹体是 4%。
  //    结论不是「画亮一点」（那正是玩家抱怨的太亮），是这些零件本来就该走抠图，
  //    让**深色**的实体去和亮草地拉开明度差。
  //
  // 键底按主体色相挑，见 scripts/chroma.py：偏绿的（藤蔓、树皮、根须）用洋红，
  // 偏暖的（蜜蜂）用绿幕。蜜蜂拿洋红键过一次，模型直接把粉画进了翅膀，
  // 13.6% 的可见像素是粉的；换绿幕后同一判据降到 0.06%。
  ...[
    { id: 'swarm_bees', frames: 6, fps: 14 },
    { id: 'temp_gl_snare', frames: 9, fps: 20 },
    { id: 'temp_gl_swarm', frames: 9, fps: 20 },
    { id: 'temp_fo_thorn', frames: 9, fps: 18 },
    { id: 'temp_fo_bark', frames: 9, fps: 20 },
    { id: 'temp_fo_warden', frames: 9, fps: 20 },
    { id: 'temp_ft_grapple', frames: 9, fps: 20 },
  ].map(({ id, frames, fps }) => ({
    id,
    vfx: true,
    blend: 'normal',
    downscale: 1,
    runs: [{ dir: id, preset: 'vfx', as: id, frames, fps }],
  })),
];

/**
 * generate2dsprite 的 FRAME_LABELS → 我们的动画名。
 * 每项返回 { name, loop, fps, labels, mirror? }[]；labels 顺序即播放顺序。
 */
const PRESETS = {
  // 4x4 四方向行走，行序固定为 down/left/right/up。
  // 播放序是 1-2-1-4 而不是 1-2-3-4：prompt 要求第 3 列与第 1 列都是「双脚并拢的中立姿势」，
  // 复用第 1 列既省掉每方向一帧图集（全表 -12%），又消掉两张中立帧之间的生图抖动。
  // 第 3 列仍然要出图——少画一列模型会把节奏排乱，它只是不进图集。
  player_sheet: ({ mirrorRight }) =>
    ['down', 'left', 'right', 'up'].map((dir) => {
      const mirror = mirrorRight && dir === 'right';
      return {
        name: `walk_${dir}`,
        loop: true,
        fps: 10,
        labels: [1, 2, 1, 4].map((i) => `${mirror ? 'left' : dir}-${i}`),
        mirror,
      };
    }),
  /**
   * 单帧静止怪：整套动画只有一张图。
   *
   * 呼吸**不出图**，由 AnimatedUnit 用代码做挤压拉伸。两张几乎一样的 AI 帧之间必然抖动
   * （行走 sheet 打成 1-2-1-4 就是为了躲开这个），画出来的呼吸会读成画面在沸腾。
   * 代码做的呼吸干净、零图集开销，还能随时调幅度。
   *
   * 六个动画名指向同一帧，图集里只存一份。没有 walk_* 与 attack_*：
   * AnimatedUnit 的 playWalk 会退回 idle（棋子照样滑格移动），playAttack 退回代码突刺。
   */
  single: ({ label }) => {
    if (!label) throw new Error('preset single 需要指定 label（帧文件名，不含 .png）');
    return ['idle', 'default', 'idle_up', 'idle_down', 'idle_left', 'idle_right'].map((name) => ({
      name,
      loop: true,
      fps: 1,
      labels: [label],
    }));
  },
  // 2x2 呼吸循环。同时登记 default，AnimatedUnit 在非 up 朝向时会取它
  idle: () =>
    ['idle', 'default'].map((name) => ({
      name,
      loop: true,
      fps: 6,
      labels: [1, 2, 3, 4].map((i) => `idle-${i}`),
    })),
  // 复用四方向行走 sheet 第 1 列的中立姿势当静止帧：那一列本来就是双脚并立的姿势。
  // idle/default 是兼容老集合的两帧（背面/正面）；idle_<facing> 让单位走完后按朝向站住，
  // AnimatedUnit.playIdle 优先取后者。帧在图集里会去重，不额外占体积。
  idle_from_walk: ({ mirrorRight }) => [
    { name: 'idle', loop: true, fps: 5, labels: ['up-1'] },
    { name: 'default', loop: true, fps: 5, labels: ['down-1'] },
    { name: 'idle_up', loop: true, fps: 5, labels: ['up-1'] },
    { name: 'idle_down', loop: true, fps: 5, labels: ['down-1'] },
    { name: 'idle_left', loop: true, fps: 5, labels: ['left-1'] },
    {
      name: 'idle_right',
      loop: true,
      fps: 5,
      labels: [mirrorRight ? 'left-1' : 'right-1'],
      mirror: !!mirrorRight,
    },
  ],
  attack: ({ facing, mirror }) => [
    {
      name: `attack_${requireFacing('attack', facing)}`,
      loop: false,
      fps: 12,
      labels: [1, 2, 3, 4].map((i) => `attack-${i}`),
      mirror,
    },
  ],
  hurt: ({ facing }) => [
    { name: facing ? `hurt_${facing}` : 'hurt', loop: false, fps: 12, labels: [1, 2, 3, 4].map((i) => `hurt-${i}`) },
  ],
  death: () => [
    { name: 'death', loop: false, fps: 10, labels: [1, 2, 3, 4, 5, 6].map((i) => `death-${i}`) },
  ],
  cast: () => [
    { name: 'cast', loop: false, fps: 12, labels: [1, 2, 3, 4, 5, 6].map((i) => `cast-${i}`) },
  ],
  // 黑底 additive 特效，帧数由 scripts/vfx-sheet.py 的网格决定，标签前缀即动画名
  vfx: ({ as, frames }) => {
    if (!as) throw new Error('preset vfx 需要指定 as（同时作为动画名与帧标签前缀）');
    if (!frames) throw new Error(`preset vfx 需要指定 frames（${as}）`);
    return [
      {
        name: as,
        loop: false,
        fps: 16,
        labels: Array.from({ length: frames }, (_, i) => `${as}-${i + 1}`),
      },
    ];
  },
  fx: ({ as }) => [{ name: as || 'fx', loop: false, fps: 16, labels: [1, 2, 3, 4].map((i) => `fx-${i}`) }],
  impact: ({ as }) => [
    { name: as || 'impact', loop: false, fps: 16, labels: [1, 2, 3, 4].map((i) => `impact-${i}`) },
  ],
  explode: ({ as }) => [
    { name: as || 'explode', loop: false, fps: 16, labels: [1, 2, 3, 4].map((i) => `explode-${i}`) },
  ],
  projectile: ({ as }) => [
    { name: as || 'projectile', loop: true, fps: 12, labels: [1, 2, 3, 4].map((i) => `projectile-${i}`) },
  ],
};

function requireFacing(preset, facing) {
  if (!facing) throw new Error(`preset ${preset} 需要指定 facing（up|down|left|right）`);
  return facing;
}

function readRunMeta(baseDir, runDir) {
  const metaAbs = path.join(ROOT, baseDir, runDir, 'pipeline-meta.json');
  if (!fs.existsSync(metaAbs)) {
    const producer =
      baseDir === VFX_RUNS_DIR ? 'scripts/vfx-sheet.py' : 'generate2dsprite.py process';
    throw new Error(`缺少 pipeline-meta.json: ${baseDir}/${runDir}（先跑 ${producer}）`);
  }
  return JSON.parse(fs.readFileSync(metaAbs, 'utf8'));
}

/** 把 process 的 QC 结论转成构建期告警，避免坏帧一路进包 */
function reportRunQc(runDir, meta) {
  const problems = [];
  for (const field of ['empty_frames', 'paste_clamped_frames', 'output_edge_touch_frames']) {
    const list = meta[field];
    if (Array.isArray(list) && list.length) problems.push(`${field}=${JSON.stringify(list)}`);
  }
  const qc = meta.qc_summary || {};
  const cv = Number(qc.body_scale_cv);
  if (Number.isFinite(cv) && cv > 0.08) problems.push(`body_scale_cv=${cv.toFixed(3)} > 0.08`);
  const anchorStd = Number(qc.anchor_y_std);
  if (Number.isFinite(anchorStd) && anchorStd > 0.05) problems.push(`anchor_y_std=${anchorStd.toFixed(3)} > 0.05`);
  if (problems.length) {
    console.warn(`[sprite2anim] ⚠ ${runDir}: ${problems.join('; ')}`);
  }
}

/** 只在偏差超过这个比例时才重采样，避免为 1% 的差异牺牲一次插值的锐度 */
const BODY_SCALE_EPS = 0.02;

/**
 * 算出每个动作相对「静止参考动作」要乘多少才能体型一致。
 *
 * 为什么必须做：generate2dsprite 的 --scale-strategy 两条路都靠不住。`fit` 把每个 run 的
 * 包围盒各自撑满格子，举剑过顶的攻击帧包围盒更高，角色就被压小；`preserve` 忠实保留 prompt
 * 里写的占比，等于把一致性押在模型听不听话上。实测剑士攻击相对行走漂移 30%（严格 QC 报
 * profile body-scale drift 0.3042），玩家会看到他一挥剑就大三成。
 *
 * 这里改成确定性对齐：用和清单 metrics 同一个 bodySpan 量出各动作的身体高度中位数，
 * 按参考动作等比校正。取中位数而不是均值，是为了不被个别姿势的判定抖动带偏。
 * 缩放以脚点为不动点，校正后角色仍站在同一条脚线上。
 */
function bodyScaleByRun(set, frameFiles, animations, loadPng) {
  const heightsByRun = new Map();
  const runOfKey = new Map();
  for (const [key, f] of Object.entries(frameFiles)) {
    runOfKey.set(key, f.runDir);
    const m = measureBody(loadPng(f.abs));
    if (!m) continue;
    if (!heightsByRun.has(f.runDir)) heightsByRun.set(f.runDir, []);
    heightsByRun.get(f.runDir).push(m.bodyHeight);
  }
  const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const bodyOf = new Map([...heightsByRun].map(([run, hs]) => [run, median(hs)]));

  // 参考动作＝提供静止帧的那个，和 subjectMetrics 取 ref 帧的规则保持一致
  const refKey = animations.default?.frames[0] ?? animations.idle?.frames[0] ?? Object.keys(frameFiles)[0];
  const refRun = runOfKey.get(refKey);
  const refBody = bodyOf.get(refRun);
  if (!refBody) return {};

  const scales = {};
  for (const [run, body] of bodyOf) {
    const s = refBody / body;
    if (Math.abs(s - 1) < BODY_SCALE_EPS) continue;
    scales[run] = s;
    console.log(
      `[sprite2anim] ${set.id}: ${run} 身体 ${body} → 对齐 ${refRun} 的 ${refBody}，缩放 ×${s.toFixed(3)}`,
    );
  }
  return scales;
}

function convertSet(set) {
  const order = [];
  const frameFiles = {};
  const animations = {};
  const qcReported = new Set();
  let cellSize = null;
  const baseDir = set.vfx ? VFX_RUNS_DIR : RUNS_DIR;

  for (const run of set.runs) {
    const build = PRESETS[run.preset];
    if (!build) throw new Error(`未知 preset: ${run.preset}`);

    const meta = readRunMeta(baseDir, run.dir);
    // 一个产物目录可以被多个 run 条目引用，QC 只报一次
    if (!qcReported.has(run.dir)) {
      qcReported.add(run.dir);
      reportRunQc(run.dir, meta);
    }

    // 同一集合内所有动作必须共享 cell 尺寸，否则单位会在动作间跳大小。
    // 用 generate2dsprite 的 --write-scale-profile / --scale-profile 锁定。
    const runCell = Number(meta.cell_size) || 0;
    if (cellSize === null) cellSize = runCell;
    else if (runCell !== cellSize) {
      throw new Error(
        `[${set.id}] ${run.dir} 的 cell_size=${runCell} 与本集合的 ${cellSize} 不一致；` +
          `请用同一个 scale profile 重跑该动作`,
      );
    }

    // 帧 key 按「来源目录 + 标签」命名，多个动画引用同一张帧时在图集里只存一份
    const runSlug = run.dir.replace(/\//g, '-');
    const labelSet = new Set(meta.frame_labels || []);
    for (const clip of build(run)) {
      if (animations[clip.name]) throw new Error(`[${set.id}] 动画名重复: ${clip.name}`);
      const keys = clip.labels.map((label) => {
        if (!labelSet.has(label)) {
          throw new Error(`[${set.id}] ${run.dir} 缺少帧标签 ${label}（实际: ${[...labelSet].join(',')}）`);
        }
        const key = `${runSlug}/${label}${clip.mirror ? '-mirror' : ''}.png`;
        if (!(key in frameFiles)) {
          const abs = path.join(ROOT, baseDir, run.dir, `${label}.png`);
          if (!fs.existsSync(abs)) throw new Error(`帧文件缺失: ${baseDir}/${run.dir}/${label}.png`);
          frameFiles[key] = { abs, mirror: !!clip.mirror, runDir: run.dir };
          order.push(key);
        }
        return key;
      });
      animations[clip.name] = { loop: clip.loop, fps: run.fps || clip.fps, frames: keys };
    }
  }

  const pngCache = new Map();
  const loadPng = (abs) => {
    let png = pngCache.get(abs);
    if (!png) {
      png = PNG.sync.read(fs.readFileSync(abs));
      pngCache.set(abs, png);
    }
    return png;
  };
  const runScales = set.vfx ? {} : bodyScaleByRun(set, frameFiles, animations, loadPng);

  const out = writeAnimSet({
    root: ROOT,
    id: set.id,
    // 默认按集合 id 溯源；多只怪共用一个产物目录时用 set.source 指到真实目录
    source: set.source || `${baseDir}/${set.id}`,
    blend: set.blend,
    downscale: set.downscale,
    order,
    readFrame(key) {
      const { abs, mirror, runDir } = frameFiles[key];
      let png = loadPng(abs);
      const s = runScales[runDir];
      if (s) {
        const m = measureBody(png);
        if (m) png = resampleAbout(png, s, m.centerX, m.feetY);
      }
      return mirror ? flipH(png) : png;
    },
    animations,
  });

  const q = hasPngquant() ? `${out.rawKb}→${out.kb}KB` : `${out.kb}KB`;
  console.log(
    `[sprite2anim] ${set.id}: ${Object.keys(animations).length} 动画 / ${out.frameCount} 帧 → ${out.atlasLogical} (${out.width}x${out.height}, ${q}), cell=${cellSize}, blend=${set.blend || 'normal'}`,
  );
}

function main() {
  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;
  const targets = only ? SETS.filter((s) => s.id === only) : SETS;
  if (only && !targets.length) throw new Error(`SETS 中没有 id=${only}`);
  if (!targets.length) {
    console.log('[sprite2anim] SETS 为空，无事可做');
    return;
  }
  for (const set of targets) convertSet(set);
  console.log('[sprite2anim] 完成');
}

main();
