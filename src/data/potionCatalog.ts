/** 一次性药剂：部署时挂在某个己方单位上，本场战斗生效，撤回部署可退回库存 */
export interface PotionDef {
  id: string;
  name: string;
  /** 本场该单位造成伤害乘数 */
  atkMul: number;
}

export const POTION_DEFS: Record<string, PotionDef> = {
  draught: {
    id: 'draught',
    name: '蛮力药剂',
    atkMul: 1.22,
  },
};
