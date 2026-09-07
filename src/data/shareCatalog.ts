/**
 * 微信转发卡片。点胶囊「转发」时随机抽一套标题 + 5:4 宣传图。
 * 图必须随包（见 `config/game.json` 的 bundledDirs），CDN 来不及。
 */
export interface ShareCard {
  id: 'tactics' | 'hill';
  title: string;
  imageUrl: string;
}

export const SHARE_CARDS: readonly ShareCard[] = [
  {
    id: 'tactics',
    title: '来吧，纹章之战！',
    imageUrl: 'images/share/share_tactics.jpg',
  },
  {
    id: 'hill',
    title: '你能撑过第二关吗？',
    imageUrl: 'images/share/share_hill.jpg',
  },
];

export function pickShareCard(rng: () => number = Math.random): ShareCard {
  const i = Math.min(SHARE_CARDS.length - 1, Math.max(0, Math.floor(rng() * SHARE_CARDS.length)));
  return SHARE_CARDS[i]!;
}

export function shareQuery(card: ShareCard): string {
  return `share=${card.id}`;
}
