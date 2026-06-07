import { hasWx } from '@/platform/wxPlatform';

declare const wx: any;

export type SfxId = 'attack' | 'skill' | 'death' | 'deploy' | 'buy' | 'click' | 'victory' | 'defeat';
export type BgmId = 'deploy' | 'battle' | 'boss' | 'shop';

interface AudioEntry {
  src: string;
  loop: boolean;
}

const BGM_MAP: Record<BgmId, AudioEntry> = {
  deploy: { src: 'audio/bgm.mp3', loop: true },
  battle: { src: 'audio/bgm.mp3', loop: true },
  boss: { src: 'audio/bgm.mp3', loop: true },
  shop: { src: 'audio/bgm.mp3', loop: true },
};

const SFX_MAP: Record<SfxId, string> = {
  attack: 'audio/bullet.mp3',
  skill: 'audio/boom.mp3',
  death: 'audio/boom.mp3',
  deploy: 'audio/bullet.mp3',
  buy: 'audio/bullet.mp3',
  click: 'audio/bullet.mp3',
  victory: 'audio/boom.mp3',
  defeat: 'audio/boom.mp3',
};

let bgmInstance: any = null;
let currentBgmId: BgmId | null = null;
let muted = false;

function createAudioContext(src: string, loop: boolean): any {
  if (!hasWx()) return null;
  try {
    const ctx = wx.createInnerAudioContext();
    ctx.src = src;
    ctx.loop = loop;
    return ctx;
  } catch (e) {
    console.warn('[AudioManager] createInnerAudioContext failed:', e);
    return null;
  }
}

export const AudioManager = {
  get isMuted(): boolean {
    return muted;
  },

  toggleMute(): boolean {
    muted = !muted;
    if (muted && bgmInstance) {
      try { bgmInstance.pause(); } catch { /* */ }
    } else if (!muted && bgmInstance && currentBgmId) {
      try { bgmInstance.play(); } catch { /* */ }
    }
    return muted;
  },

  playBgm(id: BgmId): void {
    if (muted) { currentBgmId = id; return; }
    if (currentBgmId === id && bgmInstance) return;
    AudioManager.stopBgm();

    const entry = BGM_MAP[id];
    bgmInstance = createAudioContext(entry.src, entry.loop);
    currentBgmId = id;
    if (bgmInstance) {
      try { bgmInstance.play(); } catch { /* */ }
    }
  },

  stopBgm(): void {
    if (bgmInstance) {
      try { bgmInstance.stop(); bgmInstance.destroy(); } catch { /* */ }
      bgmInstance = null;
    }
    currentBgmId = null;
  },

  playSfx(id: SfxId): void {
    if (muted) return;
    const src = SFX_MAP[id];
    const ctx = createAudioContext(src, false);
    if (ctx) {
      ctx.onEnded(() => {
        try { ctx.destroy(); } catch { /* */ }
      });
      try { ctx.play(); } catch { /* */ }
    }
  },

  destroy(): void {
    AudioManager.stopBgm();
  },
};
