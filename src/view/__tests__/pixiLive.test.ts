import { describe, expect, it } from 'vitest';
import { isDisplayLive } from '@/view/pixiLive';

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
