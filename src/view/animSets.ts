import * as PIXI from 'pixi.js';
import { AssetLoader } from '@/core/AssetLoader';
import { AssetManager, type AssetBundleDef } from '@/core/AssetManager';
import swordManifest from '@/data/anim/sword.json';
import slashManifest from '@/data/anim/slash.json';
import bowManifest from '@/data/anim/bow.json';
import shieldManifest from '@/data/anim/shield.json';
import cavalryManifest from '@/data/anim/cavalry.json';
import mageManifest from '@/data/anim/mage.json';
import healerManifest from '@/data/anim/healer.json';
import bloodfangManifest from '@/data/anim/bloodfang.json';
import slimeManifest from '@/data/anim/slime.json';
import sporecapManifest from '@/data/anim/sporecap.json';
import bloodwolfManifest from '@/data/anim/bloodwolf.json';
import rockshellManifest from '@/data/anim/rockshell.json';
import roarManifest from '@/data/anim/roar.json';
import bloodfangRoarManifest from '@/data/anim/bloodfang_roar.json';
import bloodfangWildfireManifest from '@/data/anim/bloodfang_wildfire.json';
import whirlManifest from '@/data/anim/whirl.json';
import quakeManifest from '@/data/anim/quake.json';
import pierceManifest from '@/data/anim/pierce.json';
import arrowHitManifest from '@/data/anim/arrow_hit.json';
import thrustManifest from '@/data/anim/thrust.json';
import bashHitManifest from '@/data/anim/bash_hit.json';
import chargeAuraManifest from '@/data/anim/charge_aura.json';
import tempGlSnareManifest from '@/data/anim/temp_gl_snare.json';
import tempGlSalveManifest from '@/data/anim/temp_gl_salve.json';
import tempGlSwarmManifest from '@/data/anim/temp_gl_swarm.json';
import tempGlHornManifest from '@/data/anim/temp_gl_horn.json';
import emberOrbManifest from '@/data/anim/ember_orb.json';
import emberBurstManifest from '@/data/anim/ember_burst.json';
import emberWaveManifest from '@/data/anim/ember_wave.json';
import flameRingManifest from '@/data/anim/flame_ring.json';
import holyOrbManifest from '@/data/anim/holy_orb.json';
import holyBurstManifest from '@/data/anim/holy_burst.json';
import holyBoltManifest from '@/data/anim/holy_bolt.json';
import healFlashManifest from '@/data/anim/heal_flash.json';
import wardAegisManifest from '@/data/anim/ward_aegis.json';
import blessRaysManifest from '@/data/anim/bless_rays.json';

/**
 * 「图集 + 动画清单」，每个集合一张图集 PNG（images/anim/<id>.png）+ TexturePacker-Hash
 * 兼容的 frames/meta，用 PIXI.Spritesheet 解析。
 *
 * images/anim 在 config/game.json 的 **cdnDirs** 里，首次启动按需下载后落本地缓存
 * （原本随包，四兵种做齐后合计 2MB、主包只剩不到 1MB 余量，已迁走）。
 * 因此加载是有网络代价的，见下面 CORE_SET_IDS 与 loadAnimSets 的加载时序。
 *
 * 两条生产路线，产物格式相同（共用 scripts/lib/animAtlas.mjs）：
 *   - scripts/tres2pixi.mjs    Godot SpriteFrames(.tres) → 清单
 *   - scripts/sprite2anim.mjs  AI 生图 + generate2dsprite 后处理 → 清单
 */
export type AnimBlend = 'normal' | 'add';

export interface AnimClip {
  loop: boolean;
  /** Godot speed，即 FPS；Pixi animationSpeed = fps / 60 */
  fps: number;
  /** 帧名（= 图集 frame key），按播放顺序排列 */
  frames: string[];
}

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

/**
 * 角色在源帧里的实际度量（构建期由 scripts/lib/animAtlas.mjs 从静止参考帧算出）。
 * 运行时靠它把不同来源、不同占比画法的单位归一化到同一屏幕高度与脚线，见 AnimatedUnit。
 */
export interface AnimMetrics {
  /** 源帧边长 */
  frameSize: number;
  /** 角色站立高度（源帧像素） */
  subjectHeight: number;
  /** 脚底在源帧中的 y */
  baselineY: number;
  /** 取度量的参考帧 key，便于排查 */
  ref: string;
}

export interface AnimManifest {
  id: string;
  source: string;
  /** 混合模式，对齐 Godot CanvasItemMaterial.blend_mode；'add' = 黑底发光特效 */
  blend?: AnimBlend;
  /** 图集 PNG 逻辑路径，如 images/anim/sword.png */
  image: string;
  meta: { size: { w: number; h: number }; scale: string; format: string };
  /** 旧清单可能没有，AnimatedUnit 会回退到按帧框缩放 */
  metrics?: AnimMetrics;
  frames: Record<string, AtlasFrame>;
  animations: Record<string, AnimClip>;
}

const MANIFESTS: Record<string, AnimManifest> = {
  sword: swordManifest as AnimManifest,
  slash: slashManifest as AnimManifest,
  bow: bowManifest as AnimManifest,
  shield: shieldManifest as AnimManifest,
  cavalry: cavalryManifest as AnimManifest,
  mage: mageManifest as AnimManifest,
  healer: healerManifest as AnimManifest,
  bloodfang: bloodfangManifest as AnimManifest,
  // 第一章杂兵，单帧静止怪：只有 idle，呼吸和出手位移由 AnimatedUnit 用代码做
  slime: slimeManifest as AnimManifest,
  sporecap: sporecapManifest as AnimManifest,
  bloodwolf: bloodwolfManifest as AnimManifest,
  rockshell: rockshellManifest as AnimManifest,
  roar: roarManifest as AnimManifest,
  bloodfang_roar: bloodfangRoarManifest as AnimManifest,
  bloodfang_wildfire: bloodfangWildfireManifest as AnimManifest,
  // 职业普攻 + 默认技能特效，全部黑底 additive。取用见 src/data/vfxCatalog.ts
  whirl: whirlManifest as AnimManifest,
  quake: quakeManifest as AnimManifest,
  pierce: pierceManifest as AnimManifest,
  temp_gl_snare: tempGlSnareManifest as AnimManifest,
  temp_gl_salve: tempGlSalveManifest as AnimManifest,
  temp_gl_swarm: tempGlSwarmManifest as AnimManifest,
  temp_gl_horn: tempGlHornManifest as AnimManifest,
  arrow_hit: arrowHitManifest as AnimManifest,
  thrust: thrustManifest as AnimManifest,
  bash_hit: bashHitManifest as AnimManifest,
  charge_aura: chargeAuraManifest as AnimManifest,
  ember_orb: emberOrbManifest as AnimManifest,
  ember_burst: emberBurstManifest as AnimManifest,
  ember_wave: emberWaveManifest as AnimManifest,
  flame_ring: flameRingManifest as AnimManifest,
  holy_orb: holyOrbManifest as AnimManifest,
  holy_burst: holyBurstManifest as AnimManifest,
  holy_bolt: holyBoltManifest as AnimManifest,
  heal_flash: healFlashManifest as AnimManifest,
  ward_aegis: wardAegisManifest as AnimManifest,
  bless_rays: blessRaysManifest as AnimManifest,
};

/**
 * 这个集合是否与我方共用美术。这些 id 就是玩家职业：敌我双方的 sword 用同一张图，
 * 只能靠染红分阵营。有专属外观的怪和 Boss 一律不染——它们本来就不像我方单位，
 * 而染红会把冷色（黏泥怪的湖蓝）洗成脏灰，丢掉「一眼认出是谁」这件更重要的事。
 */
export function sharesPlayerArt(setId: string): boolean {
  return (
    setId === 'sword'
    || setId === 'bow'
    || setId === 'cavalry'
    || setId === 'shield'
    || setId === 'mage'
    || setId === 'healer'
  );
}

/**
 * 第一章单帧杂兵。剪影是宽块状（黏泥/伞盖/四足/龟壳），按英雄同高归一化会显得比人还壮；
 * 渲染时用更矮的身体高度（见 `unitHeightCells`），token 派生也跟着缩。
 */
const MOOK_ART_SETS = new Set(['slime', 'sporecap', 'bloodwolf', 'rockshell']);

export function isMookArt(setId: string): boolean {
  return MOOK_ART_SETS.has(setId);
}

/**
 * 优先拉取的集合：各兵种外观 + 普攻特效。敌我通用，每场战斗都要用，
 * 而 Boss 外观、技能特效只在特定关卡出现，排在它们后面。
 *
 * 这里只决定**下载顺序**，不代表谁阻塞首屏：图集在 cdnDirs 里，首次启动要走网络、
 * 全部约 2MB，挡在主页前面就是白屏几秒。所以 loadAnimSets 整个转后台，
 * 真正的兜底是进战前 GameFlow.resolveBattle 里的 ensureAnimSets。
 */
const CORE_SET_IDS: readonly string[] = [
  'sword',
  'bow',
  'shield',
  'cavalry',
  'mage',
  'healer',
  // 职业普攻特效：每场必用。少一张的表现是那个职业的普攻悄悄
  // 退回剑士的挥砍，而这种降级没人会当成 bug 报上来，所以宁可排进优先段
  'slash',
  'arrow_hit',
  'thrust',
  'bash_hit',
  // 默认技能特效：一进第一关就会看到（AI 杂兵也放），合计 170KB
  'whirl',
  'pierce',
  'quake',
  'charge_aura',
  'ember_orb',
  'ember_burst',
  'ember_wave',
  'flame_ring',
  'holy_orb',
  'holy_burst',
  'holy_bolt',
  'heal_flash',
  'ward_aegis',
  'bless_rays',
  // 第一章四只杂兵：新玩家第一场就会遇上，四张加起来才 45KB，排进优先段几乎不占时间
  'slime',
  'sporecap',
  'bloodwolf',
  'rockshell',
];

const sheets = new Map<string, PIXI.Spritesheet>();
/** 同一集合的并发/重复请求复用同一个 Promise，避免重复下载图集 */
const loading = new Map<string, Promise<void>>();

function animBundleName(setId: string): string {
  return `anim:${setId}`;
}

export function getAnimManifest(setId: string): AnimManifest | null {
  return MANIFESTS[setId] ?? null;
}

export function hasAnimSet(setId: string): boolean {
  return setId in MANIFESTS;
}

export function getAnimBlend(setId: string): AnimBlend {
  return MANIFESTS[setId]?.blend ?? 'normal';
}

export function getClip(setId: string, name: string): AnimClip | undefined {
  return MANIFESTS[setId]?.animations[name];
}

export function animSetReady(setId: string): boolean {
  return sheets.has(setId);
}

/** 按动画名取该动画的帧贴图（来自已解析图集）；未就绪返回空数组 */
export function getAnimTextures(setId: string, name: string): PIXI.Texture[] {
  const sheet = sheets.get(setId);
  const clip = MANIFESTS[setId]?.animations[name];
  if (!sheet || !clip) return [];
  const out: PIXI.Texture[] = [];
  for (const key of clip.frames) {
    const tex = sheet.textures[key];
    if (tex) out.push(tex);
  }
  return out;
}

/** 图集帧是否都落在底图里。清单按新图写、CDN/缓存还是旧的 256 idle 图时会失败。 */
export function atlasFramesFit(
  texW: number,
  texH: number,
  frames: Record<string, Pick<AtlasFrame, 'frame'>>,
): boolean {
  if (texW <= 0 || texH <= 0) return false;
  for (const { frame } of Object.values(frames)) {
    if (frame.x + frame.w > texW + 0.5 || frame.y + frame.h > texH + 0.5) return false;
  }
  return true;
}

function textureSize(tex: PIXI.Texture): { w: number; h: number } {
  const base = tex.baseTexture;
  return {
    w: base.realWidth || base.width,
    h: base.realHeight || base.height,
  };
}

async function parseSheet(tex: PIXI.Texture, manifest: AnimManifest): Promise<boolean> {
  const { w, h } = textureSize(tex);
  if (!atlasFramesFit(w, h, manifest.frames)) {
    console.warn(
      `[animSets] ${manifest.id} 底图 ${w}x${h} 装不下清单（${manifest.meta.size.w}x${manifest.meta.size.h}）`,
    );
    return false;
  }
  try {
    const sheet = new PIXI.Spritesheet(tex.baseTexture, {
      frames: manifest.frames as unknown as PIXI.ISpritesheetData['frames'],
      meta: manifest.meta as unknown as PIXI.ISpritesheetData['meta'],
    });
    await sheet.parse();
    sheets.set(manifest.id, sheet);
    return true;
  } catch (e) {
    console.warn(`[animSets] ${manifest.id} 图集解析失败`, e);
    return false;
  }
}

async function loadOneSet(manifest: AnimManifest): Promise<void> {
  const bundle: AssetBundleDef = {
    name: animBundleName(manifest.id),
    assets: { __atlas__: manifest.image },
  };
  await AssetManager.loadBundle(bundle);
  const tex = AssetManager.texture(animBundleName(manifest.id), '__atlas__');
  if (!tex || tex === PIXI.Texture.WHITE) {
    console.warn(`[animSets] 图集加载失败: ${manifest.image}`);
    return;
  }
  if (await parseSheet(tex, manifest)) return;

  // 常见情况：祭司图集从 256 idle 扩成 2048 行走表，本地/CDN 还留着旧文件。
  // 清掉缓存再拉一次；拉回来仍对不上就放弃，回退静态单位贴图，不要把整场战斗打崩。
  AssetManager.evict(animBundleName(manifest.id), '__atlas__');
  AssetLoader.invalidateCache(manifest.image);
  await AssetManager.loadBundle(bundle);
  const retry = AssetManager.texture(animBundleName(manifest.id), '__atlas__');
  if (!retry || retry === PIXI.Texture.WHITE) {
    console.warn(`[animSets] 图集重下失败: ${manifest.image}`);
    return;
  }
  if (!(await parseSheet(retry, manifest))) {
    console.warn(`[animSets] ${manifest.id} 图集仍不匹配，回退静态贴图`);
  }
}

function loadSetOnce(setId: string): Promise<void> {
  const cached = loading.get(setId);
  if (cached) return cached;
  const manifest = MANIFESTS[setId];
  if (!manifest) return Promise.resolve();
  const p = loadOneSet(manifest);
  loading.set(setId, p);
  return p;
}

/**
 * 确保指定集合已加载。幂等，可在进战前调用来提前拉取本场要用的 Boss 外观与技能特效。
 * 未注册的 id 直接忽略。
 */
export async function ensureAnimSets(setIds: readonly string[]): Promise<void> {
  await Promise.all(setIds.map(loadSetOnce));
}

/**
 * 启动时调用一次，后台按 CORE_SET_IDS 优先的顺序把全部图集拉下来。**不要 await 它**——
 * 图集走 CDN，首次启动约 2MB，await 就等于主页白屏几秒。战斗真正需要时由
 * `ensureAnimSets` 兜底，它会复用这里已经在飞的请求。
 */
export function loadAnimSets(): void {
  const deferred = Object.keys(MANIFESTS).filter((id) => !CORE_SET_IDS.includes(id));
  void ensureAnimSets(CORE_SET_IDS)
    .then(() => ensureAnimSets(deferred))
    .catch((e) => {
      console.warn('[animSets] 后台图集加载失败，将回退静态贴图', e);
    });
}
