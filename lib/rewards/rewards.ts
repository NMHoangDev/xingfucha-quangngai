export type RewardType = "voucher" | "item";

export type Reward = {
  id: number;
  label: string;
  type: RewardType;
  code?: string;
  icon: "voucher" | "topping" | "discount" | "combo";
  weight: number;
};

export const REWARDS: Reward[] = [
  {
    id: 0,
    label: "1 Topping bất kỳ",
    type: "voucher",
    code: "TOPPING",
    icon: "topping",
    weight: 25,
  },
  {
    id: 1,
    label: "1 Trà sữa bất kỳ (M)",
    code: "TRA-SUA-M",
    type: "voucher",
    icon: "combo",
    weight: 25,
  },
  {
    id: 2,
    label: "1 Nước dừa bất kỳ (L)",
    type: "voucher",
    code: "NUOCDUA-L",
    icon: "discount",
    weight: 25,
  },
  {
    id: 3,
    label: "1 Trà trái cây bất kỳ (L)",
    type: "voucher",
    code: "TRA-TRAI-CAY-L",
    icon: "voucher",
    weight: 25,
  },
];
