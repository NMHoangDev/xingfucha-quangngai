export type RewardType = "voucher" | "item";

export type LocationRecord = {
  locationId: string;
  locationName: string;
  active: boolean;
};

export type CampaignRecord = {
  campaignId: string;
  locationId: string;
  campaignName: string;
  spinStart: string;
  spinEnd: string;
  active: boolean;
};

export type PrizeRecord = {
  rewardId: number;
  locationId: string;
  campaignId: string;
  weight: number;
};

export type SpinLogRecord = {
  spinLogId: string;
  visitorId: string;
  locationId: string;
  campaignId: string;
  rewardId: number;
  rewardLabel: string;
  rewardType: RewardType;
  rewardCode: string | null;
  customerName: string;
  customerPhone: string;
  createdAt: string;
  dayKey: string;
};

export type VoucherRecord = {
  voucherCode: string;
  spinLogId: string;
  locationId: string;
  campaignId: string;
  visitorId: string;
  rewardId: number;
  rewardLabel: string;
  rewardCode: string | null;
  customerName: string;
  customerPhone: string;
  status: "unused" | "used";
  issuedAt: string;
  expireAt: string | null;
  usedAt: string | null;
};

export type DeviceUserRecord = {
  visitorId: string;
  customerName: string;
  customerPhone: string;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Khóa phiên trình duyệt gắn với device_id lần đầu vào; cột F sheet users */
  sessionId: string;
};
