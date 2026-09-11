import { describe, expect, it } from 'vitest';
import { canOfferBossShareHeal, SHARE_HEAL_POTION_ID } from '../shareHeal';

describe('Boss 战转发领血瓶', () => {
  it('只给治疗药剂', () => {
    expect(SHARE_HEAL_POTION_ID).toBe('heal');
  });

  it('Boss 战没有血瓶才能转', () => {
    expect(canOfferBossShareHeal({ bossBattle: true, healCount: 0, alreadyShared: false })).toBe(true);
    expect(canOfferBossShareHeal({ bossBattle: true, healCount: 1, alreadyShared: false })).toBe(false);
    expect(canOfferBossShareHeal({ bossBattle: false, healCount: 0, alreadyShared: false })).toBe(false);
  });

  it('本场转过一次就不能再转，有没有库存都一样', () => {
    expect(canOfferBossShareHeal({ bossBattle: true, healCount: 0, alreadyShared: true })).toBe(false);
    expect(canOfferBossShareHeal({ bossBattle: true, healCount: 1, alreadyShared: true })).toBe(false);
  });
});
