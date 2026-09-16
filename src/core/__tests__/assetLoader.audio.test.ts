import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cdnConfig } from '@/config/cdnConfig';
import { AssetLoader, getCdnUrl, isCdnPath, playableAudioSrc, toInnerAudioSrc } from '@/core/AssetLoader';

describe('BGM 走 CDN 的音频路径', () => {
  it('audio/bgm 是 CDN，audio/sfx 仍随包', () => {
    expect(cdnConfig.cdnDirs).toContain('audio/bgm');
    expect(isCdnPath('audio/bgm/hub.mp3')).toBe(true);
    expect(isCdnPath('audio/bgm/battle.mp3')).toBe(true);
    expect(isCdnPath('audio/sfx/ui_click.mp3')).toBe(false);
  });

  it('开发者工具 http://usr 才改写成 wxfile，真机 https / 相对路径不动', () => {
    expect(toInnerAudioSrc('http://usr/cdn_cache/audio/bgm/hub.mp3'))
      .toBe('wxfile://usr/cdn_cache/audio/bgm/hub.mp3');
    expect(toInnerAudioSrc('https://usr/cdn_cache/audio/bgm/hub.mp3'))
      .toBe('wxfile://usr/cdn_cache/audio/bgm/hub.mp3');
    expect(toInnerAudioSrc('wxfile://usr/cdn_cache/audio/bgm/hub.mp3'))
      .toBe('wxfile://usr/cdn_cache/audio/bgm/hub.mp3');
    expect(toInnerAudioSrc('audio/bgm/hub.mp3')).toBe('audio/bgm/hub.mp3');
    const https = getCdnUrl('audio/bgm/hub.mp3');
    expect(https.startsWith('https://')).toBe(true);
    expect(toInnerAudioSrc(https)).toBe(https);
  });

  it('Node 测环境没有包内文件时，resolveAudioSrc 回落公开 https，不把相对路径交给 InnerAudio', async () => {
    const src = await AssetLoader.resolveAudioSrc('audio/bgm/hub.mp3');
    expect(src).toBe(getCdnUrl('audio/bgm/hub.mp3'));
  });

  it('开发者工具 http://usr 缓存不喂给 InnerAudio，改走 CDN https', () => {
    const cached = 'http://usr/cdn_cache/audio/bgm/hub.mp3';
    const src = playableAudioSrc(cached, 'audio/bgm/hub.mp3');
    expect(src).toBe(getCdnUrl('audio/bgm/hub.mp3'));
    expect(src.startsWith('http://usr')).toBe(false);
  });

  it('启动诊断只在 boot 没跑起来时弹窗', () => {
    const js = readFileSync('game.js', 'utf8');
    expect(js).toContain('function _booted');
    expect(js).toMatch(/function _showDiag\(\)[\s\S]*if \(_booted\(\)\) return/);
    expect(js).toContain('wx.onError');
  });

  it('AudioManager 播 BGM 前走 resolveAudioSrc，SFX 仍用包内路径', () => {
    const audio = readFileSync('src/core/AudioManager.ts', 'utf8');
    expect(audio).toContain('resolveAudioSrc');
    expect(audio).toMatch(/playBgm[\s\S]*startResolvedBgm/);
    expect(audio).toContain("ui_click: 'audio/sfx/ui_click.mp3'");
    expect(audio).not.toMatch(/playSfx\([\s\S]*resolveAudioSrc/);
  });
});
