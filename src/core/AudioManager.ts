import { hasWx } from '@/platform/wxPlatform';

declare const wx: any;

export type SfxId =
  | 'ui_click'
  | 'ui_deny'
  | 'ui_open'
  | 'ui_tab'
  | 'sfx_soul_spend'
  | 'sfx_unlock'
  | 'sfx_soul_gain'
  | 'sfx_reveal'
  | 'sfx_levelup'
  | 'sfx_coin'
  | 'sfx_buy'
  | 'sfx_deploy'
  | 'sfx_sweep'
  | 'sfx_step'
  | 'sfx_undo'
  | 'sfx_wait'
  | 'sfx_hit_melee'
  | 'sfx_hit_arrow'
  | 'sfx_hit_physical'
  | 'sfx_hit_magic'
  | 'sfx_death'
  | 'sfx_heal'
  | 'sfx_potion'
  | 'sfx_gate'
  | 'sfx_ignite'
  | 'sfx_victory'
  | 'sfx_defeat'
  | 'sfx_skill_physical'
  | 'sfx_skill_fire'
  | 'sfx_skill_frost'
  | 'sfx_skill_poison'
  | 'sfx_skill_holy'
  | 'sfx_skill_boss'
  | 'sfx_skill_whirl'
  | 'sfx_skill_pierce'
  | 'sfx_skill_bash'
  | 'sfx_skill_lance_thrust'
  | 'sfx_skill_ember'
  | 'sfx_skill_heal_touch'
  | 'sfx_skill_frost_ring';

export type BgmId = 'hub' | 'deploy' | 'battle' | 'boss' | 'shop';

interface AudioHandle {
  play(): void;
  pause(): void;
  stop(): void;
  destroy(): void;
  onEnded(fn: () => void): void;
}

interface AudioEntry {
  src: string;
  loop: boolean;
  /** 0~1。战斗曲压低，避免盖住技能/受击。 */
  volume?: number;
}

const BGM_MAP: Record<BgmId, AudioEntry> = {
  hub: { src: 'audio/bgm/hub.mp3', loop: true, volume: 0.72 },
  deploy: { src: 'audio/bgm/deploy.mp3', loop: true, volume: 0.68 },
  battle: { src: 'audio/bgm/battle.mp3', loop: true, volume: 0.32 },
  /** v1 复用战斗曲，后补 `audio/bgm/boss.mp3` 时只改这里 */
  boss: { src: 'audio/bgm/battle.mp3', loop: true, volume: 0.32 },
  shop: { src: 'audio/bgm/shop.mp3', loop: true, volume: 0.7 },
};

const SFX_MAP: Record<SfxId, string> = {
  ui_click: 'audio/sfx/ui_click.mp3',
  ui_deny: 'audio/sfx/ui_deny.mp3',
  ui_open: 'audio/sfx/ui_open.mp3',
  ui_tab: 'audio/sfx/ui_tab.mp3',
  sfx_soul_spend: 'audio/sfx/sfx_soul_spend.mp3',
  sfx_unlock: 'audio/sfx/sfx_unlock.mp3',
  sfx_soul_gain: 'audio/sfx/sfx_soul_gain.mp3',
  sfx_reveal: 'audio/sfx/sfx_reveal.mp3',
  sfx_levelup: 'audio/sfx/sfx_levelup.mp3',
  sfx_coin: 'audio/sfx/sfx_coin.mp3',
  sfx_buy: 'audio/sfx/sfx_buy.mp3',
  sfx_deploy: 'audio/sfx/sfx_deploy.mp3',
  sfx_sweep: 'audio/sfx/sfx_sweep.mp3',
  sfx_step: 'audio/sfx/sfx_step.mp3',
  sfx_undo: 'audio/sfx/sfx_undo.mp3',
  sfx_wait: 'audio/sfx/sfx_wait.mp3',
  sfx_hit_melee: 'audio/sfx/sfx_hit_melee.mp3',
  sfx_hit_arrow: 'audio/sfx/sfx_hit_arrow.mp3',
  sfx_hit_physical: 'audio/sfx/sfx_hit_physical.mp3',
  sfx_hit_magic: 'audio/sfx/sfx_hit_magic.mp3',
  sfx_death: 'audio/sfx/sfx_death.mp3',
  sfx_heal: 'audio/sfx/sfx_heal.mp3',
  sfx_potion: 'audio/sfx/sfx_potion.mp3',
  sfx_gate: 'audio/sfx/sfx_gate.mp3',
  sfx_ignite: 'audio/sfx/sfx_ignite.mp3',
  sfx_victory: 'audio/sfx/sfx_victory.mp3',
  sfx_defeat: 'audio/sfx/sfx_defeat.mp3',
  sfx_skill_physical: 'audio/sfx/sfx_skill_physical.mp3',
  sfx_skill_fire: 'audio/sfx/sfx_skill_fire.mp3',
  sfx_skill_frost: 'audio/sfx/sfx_skill_frost.mp3',
  sfx_skill_poison: 'audio/sfx/sfx_skill_poison.mp3',
  sfx_skill_holy: 'audio/sfx/sfx_skill_holy.mp3',
  sfx_skill_boss: 'audio/sfx/sfx_skill_boss.mp3',
  sfx_skill_whirl: 'audio/sfx/sfx_skill_whirl.mp3',
  sfx_skill_pierce: 'audio/sfx/sfx_skill_pierce.mp3',
  sfx_skill_bash: 'audio/sfx/sfx_skill_bash.mp3',
  sfx_skill_lance_thrust: 'audio/sfx/sfx_skill_lance_thrust.mp3',
  sfx_skill_ember: 'audio/sfx/sfx_skill_ember.mp3',
  sfx_skill_heal_touch: 'audio/sfx/sfx_skill_heal_touch.mp3',
  sfx_skill_frost_ring: 'audio/sfx/sfx_skill_frost_ring.mp3',
};

/** 走格子会连发；80ms 内只留第一下，避免 4 格变成机关枪 */
const SFX_THROTTLE_MS: Partial<Record<SfxId, number>> = {
  sfx_step: 80,
  /** 贯穿连中时不要叠成机关枪，但仍要听出每一记 */
  sfx_hit_physical: 50,
  sfx_hit_magic: 50,
};

const MUTE_KEY = 'srpg.audio.muted';

let bgmInstance: AudioHandle | null = null;
let currentBgmId: BgmId | null = null;
let muted = readMuted();
const lastSfxAt = new Map<SfxId, number>();

function readMuted(): boolean {
  try {
    if (hasWx()) return wx.getStorageSync?.(MUTE_KEY) === '1';
    if (typeof localStorage !== 'undefined') return localStorage.getItem(MUTE_KEY) === '1';
  } catch { /* */ }
  return false;
}

function writeMuted(on: boolean): void {
  try {
    if (hasWx()) {
      wx.setStorageSync?.(MUTE_KEY, on ? '1' : '0');
      return;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MUTE_KEY, on ? '1' : '0');
    }
  } catch { /* */ }
}

function applyVolume(target: { volume?: number }, volume: number): void {
  try { target.volume = volume; } catch { /* */ }
}

function wrapWx(ctx: any): AudioHandle {
  return {
    play() { try { ctx.play(); } catch { /* */ } },
    pause() { try { ctx.pause(); } catch { /* */ } },
    stop() { try { ctx.stop(); } catch { /* */ } },
    destroy() { try { ctx.destroy(); } catch { /* */ } },
    onEnded(fn) {
      try { ctx.onEnded(fn); } catch { /* */ }
    },
  };
}

function wrapHtml(el: HTMLAudioElement): AudioHandle {
  return {
    play() { void el.play().catch(() => undefined); },
    pause() { try { el.pause(); } catch { /* */ } },
    stop() {
      try {
        el.pause();
        el.currentTime = 0;
      } catch { /* */ }
    },
    destroy() {
      try {
        el.pause();
        el.src = '';
      } catch { /* */ }
    },
    onEnded(fn) { el.addEventListener('ended', fn, { once: true }); },
  };
}

function createAudio(src: string, loop: boolean, volume = 1): AudioHandle | null {
  if (hasWx()) {
    try {
      const ctx = wx.createInnerAudioContext();
      ctx.src = src;
      ctx.loop = loop;
      applyVolume(ctx, volume);
      return wrapWx(ctx);
    } catch (e) {
      console.warn('[AudioManager] createInnerAudioContext failed:', e);
      return null;
    }
  }
  if (typeof Audio === 'undefined') return null;
  try {
    const el = new Audio(src);
    el.loop = loop;
    el.preload = 'auto';
    applyVolume(el, volume);
    return wrapHtml(el);
  } catch (e) {
    console.warn('[AudioManager] HTMLAudio failed:', e);
    return null;
  }
}

function applyMuteToBgm(): void {
  if (!bgmInstance) return;
  if (muted) bgmInstance.pause();
  else if (currentBgmId) bgmInstance.play();
}

export const AudioManager = {
  get isMuted(): boolean {
    return muted;
  },

  setMuted(on: boolean): boolean {
    muted = on;
    writeMuted(on);
    applyMuteToBgm();
    return muted;
  },

  toggleMute(): boolean {
    return AudioManager.setMuted(!muted);
  },

  playBgm(id: BgmId): void {
    if (currentBgmId === id && bgmInstance) {
      if (!muted) bgmInstance.play();
      return;
    }
    AudioManager.stopBgm();
    currentBgmId = id;
    if (muted) return;
    const entry = BGM_MAP[id];
    bgmInstance = createAudio(entry.src, entry.loop, entry.volume ?? 1);
    bgmInstance?.play();
  },

  stopBgm(): void {
    if (bgmInstance) {
      bgmInstance.stop();
      bgmInstance.destroy();
      bgmInstance = null;
    }
    currentBgmId = null;
  },

  playSfx(id: SfxId): void {
    if (muted) return;
    const gap = SFX_THROTTLE_MS[id];
    if (gap != null) {
      const now = Date.now();
      const prev = lastSfxAt.get(id) ?? 0;
      if (now - prev < gap) return;
      lastSfxAt.set(id, now);
    }
    const src = SFX_MAP[id];
    const handle = createAudio(src, false);
    if (!handle) return;
    handle.onEnded(() => handle.destroy());
    handle.play();
  },

  destroy(): void {
    AudioManager.stopBgm();
  },
};

export function muteButtonLabel(): string {
  return AudioManager.isMuted ? '取消静音' : '静音';
}
