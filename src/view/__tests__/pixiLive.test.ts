import { describe, expect, it, vi } from 'vitest';
import { isDisplayLive, safeDestroy } from '@/view/pixiLive';

describe('isDisplayLive', () => {
  it('rejects null / destroyed / missing transform', () => {
    expect(isDisplayLive(null)).toBe(false);
    expect(isDisplayLive(undefined)).toBe(false);
    expect(isDisplayLive({ destroyed: true, transform: {} } as never)).toBe(false);
    expect(isDisplayLive({ destroyed: false, transform: null } as never)).toBe(false);
  });

  it('accepts a live display object', () => {
    expect(isDisplayLive({ destroyed: false, transform: { position: {} } } as never)).toBe(true);
  });
});

describe('safeDestroy', () => {
  it('skips null / already-dead objects', () => {
    expect(() => safeDestroy(null)).not.toThrow();
    expect(() => safeDestroy({ destroyed: true, transform: {}, destroy: () => {
      throw new Error('should not destroy twice');
    } } as never)).not.toThrow();
  });

  it('swallows WeChat-style _texture.off crash on a still-marked-live object', () => {
    const obj = {
      destroyed: false,
      transform: {},
      destroy: vi.fn(() => {
        throw new TypeError("Cannot read properties of null (reading 'off')");
      }),
    };
    expect(() => safeDestroy(obj as never)).not.toThrow();
    expect(obj.destroy).toHaveBeenCalledOnce();
  });
});
