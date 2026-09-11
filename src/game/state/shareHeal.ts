/** Boss 战转发领取的就是治疗药剂，不是蛮力 / 迟缓。 */
export const SHARE_HEAL_POTION_ID = 'heal';

/**
 * Boss 战没有治疗药剂（开打就没带，或打着用完）时，可以转发领一瓶。
 * 本场战斗只给一次；回布阵重打会新建回放层，次数清零。
 */
export function canOfferBossShareHeal(opts: {
  bossBattle: boolean;
  healCount: number;
  alreadyShared: boolean;
}): boolean {
  return opts.bossBattle && !opts.alreadyShared && opts.healCount <= 0;
}
