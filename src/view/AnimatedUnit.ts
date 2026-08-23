import * as PIXI from 'pixi.js';
import {
  animSetReady,
  getAnimBlend,
  getAnimManifest,
  getAnimTextures,
  getClip,
  isMookArt,
  sharesPlayerArt,
  type AnimManifest,
} from '@/view/animSets';
import {
  HIT_FLASH_MS,
  HIT_KNOCK_MS,
  HIT_KNOCK_PX,
  createHitFlashOverlay,
  hitFlashLift,
  hitKnockDisplacement,
  syncHitFlashOverlay,
} from '@/view/battle/hitFeel';
import { isDisplayLive, safeDestroy } from '@/view/pixiLive';
import { attachCorePass } from '@/view/vfxBlend';

/** 缺 metrics 的旧清单回退用的源尺寸基准（Godot 帧为 512px 方图） */
const SOURCE_FRAME_SIZE = 512;
/** 缺 metrics 时按帧框缩放的倍率（旧行为，各集合大小会不一致） */
const DISPLAY_SCALE = 1.35;

/**
 * 棋盘单位的**身体**（头顶到脚，不含道具）占几格。这是全项目单位大小的唯一标准：
 * 清单里的 metrics.subjectHeight 由打包期的 bodySpan 切出，已排除举过头顶的武器、
 * 翎羽、犄角这类细长道具，按它归一化，不同来源（Godot / 工具生图）、不同画法占比的角色
 * 都会渲染成同一个屏幕高度。
 *
 * 归一化的是身体而不是整个包围盒，所以**道具可以自由超出格子**——棋盘没有 mask 也没有
 * z 排序，溢出不会被裁。美术因此不必为了"框进一格"而把长兵器缩小或压低，竖举的长枪、
 * 法杖、犄角都可以正常设计。
 *
 * 不要改回按源帧边长缩放——那样谁在帧里画得满谁就显示得大，实测 bow 比 sword 高 47%。
 * 数值本身没有含义，只是让屏幕大小跟着 bodySpan 的口径走：口径改一次就按剑士重新标定一次
 * （剑士身体现测 125、包围盒 129，历史上按整包围盒是 0.95，故 0.95 × 125/129 ≈ 0.92），
 * 保证判据演进不会悄悄改变已有单位的大小。
 */
export const UNIT_HEIGHT_CELLS = 0.92;
/**
 * 杂兵身体高度。块状剪影（水滴/伞盖/四足/龟壳）同高时视觉质量比人形大一圈，
 * 缩到约 3/4 才读得像「小怪」而不是「另一拨英雄」。
 */
export const MOOK_HEIGHT_CELLS = 0.7;
/** 脚线落在格心下方多少格，让单位站住而不是浮在格心 */
export const FEET_BELOW_CENTER = 0.2;
const ENEMY_TINT = 0xffaaaa;

/** 该集合在棋盘上的身体高度（格）。杂兵矮一档，其余一律 UNIT_HEIGHT_CELLS。 */
export function unitHeightCells(setId: string): number {
  return isMookArt(setId) ? MOOK_HEIGHT_CELLS : UNIT_HEIGHT_CELLS;
}

/**
 * 头顶相对单位容器原点（格心）的本地 y（向上为负）。
 *
 * 脚线在 `+FEET_BELOW_CENTER`，头顶再往上一个身体高度。血条底边应对齐这里再留一点空隙，
 * 以前写死 `cell * 0.4`——实际头顶约在 `0.72` 格，血条就会压进头发/伞盖。
 */
export function unitHeadLocalY(setId: string, cell: number): number {
  return cell * (FEET_BELOW_CENTER - unitHeightCells(setId));
}

/**
 * 没有行走图集的单位（第一章的单帧杂兵）靠代码做呼吸。
 *
 * 呼吸不出图是有意的：两张几乎一样的相邻帧之间必然抖动，画出来的呼吸读成画面在沸腾
 * 而不是生物在喘气（行走 sheet 打成 1-2-1-4 也是为了躲这个）。挤压拉伸是纯几何变换，
 * 交给代码保证干净，还省掉每只怪三四帧图集。横向做反向的轻微补偿，比单纯拉高更像活物。
 * 相位随机错开，否则一排怪会整齐划一地同频起伏，比不动还假。
 */
const BREATH_AMP = 0.045;
const BREATH_PERIOD_MS = 2300;
const BREATH_SQUASH = 0.7;

/**
 * 没有攻击图集时的代码突刺：朝目标冲出去再回来。
 *
 * 不能就这么 return 0 —— 伤害数字和挥砍特效都出现在被打的那一格，攻击方全程杵着不动的话
 * 读起来像是它旁边的人在打，出手的是谁看不出来。位移只要给这一拍一个起点就够。
 */
const LUNGE_MS = 260;
const LUNGE_CELLS = 0.26;

export interface AnimatedUnitHandle {
  view: PIXI.Container;
  playIdle(): void;
  playWalk(dx: number, dy: number): void;
  /** 播放朝向目标的攻击动画，返回时长(ms)，播完自动回到 idle */
  playAttack(dx: number, dy: number): number;
  /**
   * 受击闪白。打击感里最便宜也最有效的一项：告诉玩家「就是这一下打到了他」。
   * 叠一张白色 ADD 层，不用 tint、也不用 Filter——微信小游戏的 FBO 经常是空的。
   */
  flashHit(ms: number): void;
  /**
   * 受击：闪白 + 沿 (nx, ny) 短震。方向是攻击者→受击者的单位向量。
   */
  playHit(nx: number, ny: number): void;
  destroy(): void;
}

type Facing = 'up' | 'down' | 'left' | 'right';

function resolveWalk(dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return 'idle';
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'walk_left' : 'walk_right';
  return dy < 0 ? 'walk_up' : 'walk_down';
}

function resolveAttack(dx: number, dy: number): string {
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'attack_left' : 'attack_right';
  return dy < 0 ? 'attack_up' : 'attack_down';
}

function facingFromDelta(dx: number, dy: number, prev: Facing): Facing {
  if (dx === 0 && dy === 0) return prev;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/**
 * 用 Godot 导出的图集创建一个可播放走/攻击/idle 的棋盘单位。
 * 图集未就绪或缺 idle 动画时返回 null（调用方应回退到 createUnitToken）。
 */
export function createAnimatedUnit(
  setId: string,
  faction: 'player' | 'enemy',
  cell: number,
  ticker: PIXI.Ticker = PIXI.Ticker.shared,
): AnimatedUnitHandle | null {
  const manifest: AnimManifest | null = getAnimManifest(setId);
  if (!manifest || !animSetReady(setId)) return null;

  const idleName = manifest.animations.idle
    ? 'idle'
    : manifest.animations.default
      ? 'default'
      : null;
  if (!idleName) return null;
  const idleTextures = getAnimTextures(setId, idleName);
  if (idleTextures.length === 0) return null;

  const view = new PIXI.Container();
  // 玩家从下往上迎敌默认背面(up)，敌人默认正面(down)
  let facing: Facing = faction === 'player' ? 'up' : 'down';

  // 图集帧是裁剪过的，Pixi 的 texture.width 返回未裁剪的 sourceSize，各集合都一样大，
  // 所以只能靠 metrics 里记录的角色实际高度来对齐大小。
  const metrics = manifest.metrics;
  const heightCells = unitHeightCells(setId);
  const fit = metrics
    ? (cell * heightCells) / metrics.subjectHeight
    : (cell * DISPLAY_SCALE) / (idleTextures[0]!.width || SOURCE_FRAME_SIZE);

  const sprite = new PIXI.AnimatedSprite(idleTextures);
  sprite.anchor.set(0.5);
  sprite.scale.set(fit);
  // anchor 0.5 对准的是源帧中心，而角色在帧里的高低各不相同，
  // 得按脚线把它挪到统一的站立位置，否则不同集合会一个悬空一个陷进格子。
  const feetOffset = metrics
    ? (metrics.baselineY - metrics.frameSize / 2) * fit
    : cell * 0.5;
  const standY = cell * FEET_BELOW_CENTER;
  sprite.position.set(0, standY - feetOffset);
  if (faction === 'enemy' && sharesPlayerArt(setId)) sprite.tint = ENEMY_TINT;
  view.addChild(sprite);

  let currentName = '';

  function play(name: string, opts?: { onComplete?: () => void }): boolean {
    const clip = getClip(setId, name);
    const textures = getAnimTextures(setId, name);
    if (!clip || textures.length === 0) return false;
    // 同一个循环动画正在播则不重启，避免移动多步抖动
    if (name === currentName && clip.loop) return true;
    currentName = name;
    sprite.textures = textures;
    sprite.loop = clip.loop;
    sprite.animationSpeed = (clip.fps || 12) / 60;
    sprite.onComplete = opts?.onComplete ?? undefined;
    sprite.gotoAndPlay(0);
    return true;
  }

  const breathes = !manifest.animations.walk_down;
  const hasAttackClip = (['down', 'left', 'right', 'up'] as const).some(
    (d) => manifest.animations[`attack_${d}`],
  );
  let breathT = Math.random() * BREATH_PERIOD_MS;
  let lungeT = -1;
  let lungeX = 0;
  let lungeY = 0;
  let hitT = -1;
  let hitNx = 1;
  let hitNy = 0;
  let flashT = -1;
  let flashDur = HIT_FLASH_MS;
  let flashOverlay: PIXI.Sprite | null = null;

  // 呼吸、突刺、受击短震都在写 sprite 的 scale/position，必须由同一个回调统一算完再写一次，
  // 否则两者会互相覆盖（突刺期间呼吸把 y 拉回去）。
  function tick(): void {
    // 切场景时整棵树被 destroy，存活单位的 handle.destroy 不会被逐个调用（只有阵亡才调），
    // 回调不自摘就会一直跑在已销毁的 sprite 上。同 updateSkillRings 的写法。
    if (!isDisplayLive(sprite) || !isDisplayLive(view)) {
      ticker.remove(tick);
      return;
    }
    const dt = PIXI.Ticker.shared.deltaMS;
    let sy = 1;
    if (breathes) {
      breathT += dt;
      sy = 1 + BREATH_AMP * Math.sin((breathT / BREATH_PERIOD_MS) * Math.PI * 2);
      // 竖向缩放的不动点是源帧中心，脚线会跟着飘；按当前倍率反算回同一条站立线
      sprite.scale.set(fit * (1 - (sy - 1) * BREATH_SQUASH), fit * sy);
    }
    let ox = 0;
    let oy = 0;
    if (lungeT >= 0) {
      lungeT += dt;
      if (lungeT >= LUNGE_MS) lungeT = -1;
      else {
        const d = Math.sin((lungeT / LUNGE_MS) * Math.PI) * cell * LUNGE_CELLS;
        ox = lungeX * d;
        oy = lungeY * d;
      }
    }
    if (hitT >= 0) {
      hitT += dt;
      if (hitT >= HIT_KNOCK_MS) hitT = -1;
      else {
        const d = hitKnockDisplacement(hitT / HIT_KNOCK_MS, HIT_KNOCK_PX);
        ox += hitNx * d;
        oy += hitNy * d;
      }
    }
    if (flashT >= 0) {
      flashT += dt;
      const k = Math.min(1, flashT / flashDur);
      if (!flashOverlay) flashOverlay = createHitFlashOverlay(sprite);
      if (k >= 1) {
        syncHitFlashOverlay(flashOverlay, sprite, 0);
        flashT = -1;
      } else {
        syncHitFlashOverlay(flashOverlay, sprite, hitFlashLift(k));
      }
    }
    sprite.position.set(ox, standY - feetOffset * sy + oy);
  }

  ticker.add(tick);

  /** 缺攻击动画时的替代出手，返回这一拍的时长(ms) */
  function startLunge(dx: number, dy: number): number {
    if (hasAttackClip || (dx === 0 && dy === 0)) return 0;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    lungeX = horizontal ? Math.sign(dx) : 0;
    lungeY = horizontal ? 0 : Math.sign(dy);
    lungeT = 0;
    return LUNGE_MS;
  }

  function playIdle(): void {
    // 有四向静止帧就按朝向站（走完不会突然转向镜头）；
    // 只有正/背两帧的老集合退回原逻辑
    if (play(`idle_${facing}`)) return;
    const name = facing === 'up' && manifest!.animations.idle ? 'idle' : 'default';
    if (!play(name)) play('idle');
  }

  function playWalk(dx: number, dy: number): void {
    facing = facingFromDelta(dx, dy, facing);
    const name = resolveWalk(dx, dy);
    if (!play(name)) playIdle();
  }

  function playAttack(dx: number, dy: number): number {
    facing = facingFromDelta(dx, dy, facing);
    let name = resolveAttack(dx, dy);
    if (!manifest!.animations[name]) name = 'attack_right';
    const clip = getClip(setId, name);
    const textures = getAnimTextures(setId, name);
    // 没有攻击图集的集合（单帧杂兵）转身面向目标，出手交给代码突刺
    if (!clip || textures.length === 0) {
      playIdle();
      return startLunge(dx, dy);
    }
    play(name, { onComplete: () => playIdle() });
    return (textures.length / (clip.fps || 12)) * 1000;
  }

  function flashHit(ms: number): void {
    if (ms <= 0 || !isDisplayLive(sprite)) return;
    flashDur = ms;
    flashT = 0;
    if (!flashOverlay) flashOverlay = createHitFlashOverlay(sprite);
    syncHitFlashOverlay(flashOverlay, sprite, hitFlashLift(0));
  }

  function playHit(nx: number, ny: number): void {
    if (!isDisplayLive(sprite)) return;
    const len = Math.hypot(nx, ny);
    hitNx = len < 0.001 ? 1 : nx / len;
    hitNy = len < 0.001 ? 0 : ny / len;
    hitT = 0;
    flashHit(HIT_FLASH_MS);
  }

  playIdle();

  return {
    view,
    playIdle,
    playWalk,
    playAttack,
    flashHit,
    playHit,
    destroy(): void {
      if (flashOverlay && !flashOverlay.destroyed) flashOverlay.visible = false;
      // 仅停止动画；view 作为 token 的子节点，由 token.destroy 统一回收。
      // 闪白层也是 view 的子节点，交给这一次 destroy，不要自己再 destroy 一次
      // （微信上对已摘掉的贴图调 off 会炸）。
      // ticker 挂在全局共享实例上，不摘会一直跑在已销毁的 sprite 上。
      ticker.remove(tick);
      sprite.stop();
      sprite.onComplete = undefined;
    },
  };
}

export interface FxPlayOptions {
  /**
   * 旋转角（弧度）。素材一律画成朝右（+X），运行时转到实际方向。
   * 环形/星形这类径向对称的特效不要传——转了看不出来，白算。
   */
  rotation?: number;
  /**
   * 射线模式：沿朝向拉长到 `lengthPx`，锚点移到左端（贴在施法者身上）。
   * 射线技能的长度是变量，固定尺寸的贴图盖不住，只能拉。
   */
  lengthPx?: number;
  /**
   * 整体不透明度（0–1，缺省 1）。两段都乘它。
   *
   * 这个字段原先是「亮度闸门」，用来压住纯 additive 叠上去把挨打的人糊白的问题；
   * 现在亮度由两段式混合本身管住了（见 `playFxAnimation`），它退回它本来的语义：
   * **这个特效该有多透**。想让单位从特效里透出来（盾、光环）才调低它，
   * 不要再拿它当亮度旋钮——调低亮度的代价是连形体一起变淡。
   */
  alpha?: number;
  /** 播放倍率。1 = 图集原速，小于 1 更慢、更能看清 */
  playbackSpeed?: number;
}


/**
 * 一次性序列帧特效（如挥砍）。播完自毁。返回时长(ms)。
 */
export function playFxAnimation(
  layer: PIXI.Container,
  x: number,
  y: number,
  setId: string,
  animName: string,
  sizePx: number,
  opts: FxPlayOptions = {},
): number {
  const clip = getClip(setId, animName);
  const textures = getAnimTextures(setId, animName);
  if (!clip || textures.length === 0) return 0;

  const isAdd = getAnimBlend(setId) === 'add';
  const opacity = opts.alpha ?? 1;
  const native = textures[0]!.width || sizePx;
  const place = (sp: PIXI.AnimatedSprite): void => {
    if (opts.lengthPx !== undefined) {
      // 左端对齐施法者，横向拉到射程；纵向仍按 sizePx，否则细长射线会被一起拉粗
      sp.anchor.set(0, 0.5);
      sp.scale.set(opts.lengthPx / native, sizePx / native);
    } else {
      sp.anchor.set(0.5);
      sp.scale.set(sizePx / native);
    }
    sp.position.set(x, y);
    sp.rotation = opts.rotation ?? 0;
    sp.loop = false;
  };

  const sprite = new PIXI.AnimatedSprite(textures);
  place(sprite);
  // 黑底特效走两段式（形体 + 核心），理由见 vfxBlend
  if (isAdd) attachCorePass(sprite, textures, opacity);
  else sprite.alpha = opacity;

  const speed = opts.playbackSpeed ?? 1;
  sprite.animationSpeed = ((clip.fps || 16) / 60) * speed;
  sprite.onComplete = () => {
    if (!isDisplayLive(sprite)) return;
    sprite.parent?.removeChild(sprite);
    // 核心层是子节点，跟着一起回收。父层若已整棵拆掉，safeDestroy 会直接跳过。
    safeDestroy(sprite, { children: true });
  };
  layer.addChild(sprite);
  sprite.gotoAndPlay(0);
  return (textures.length / ((clip.fps || 16) * speed)) * 1000;
}
