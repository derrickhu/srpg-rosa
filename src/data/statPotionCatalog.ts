/** 永久属性药剂：使用后从库存扣除，指定己方已部署单位，该单位本场及之后整局保留加成（撤回单位时加成进入同兵种队列，下次上场继承） */
export interface StatPotionDef {
  id: string;
  name: string;
  addAtk: number;
  addSpd: number;
  addMove: number;
}

export const STAT_POTION_DEFS: Record<string, StatPotionDef> = {
  perm_atk: { id: 'perm_atk', name: '力量精华', addAtk: 1, addSpd: 0, addMove: 0 },
  perm_spd: { id: 'perm_spd', name: '敏捷精华', addAtk: 0, addSpd: 1, addMove: 0 },
  perm_move: { id: 'perm_move', name: '远行精华', addAtk: 0, addSpd: 0, addMove: 1 },
};
