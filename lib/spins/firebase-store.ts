import { FieldValue } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import {
  normalizeCustomerName,
  normalizeVietnamesePhone,
  type SpinRecord,
  type RewardKind,
} from "./store";

type FirebaseSpinDoc = {
  name: string;
  name_normalized: string;
  phone: string;
  phone_normalized: string;
  device_fingerprint: string;
  reward_index: number;
  reward_id: number;
  reward_code: string | null;
  reward_label: string;
  reward_type: RewardKind;
  status: "used" | "unused";
  voucher_delay_minutes: number;
  voucher_usable_from: string | null;
  created_at: string;
  updated_at: string;
  used_at: string | null;
  day_key: string;
  used_day_key: string | null;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function toSpinRecord(id: string, data: FirebaseSpinDoc): SpinRecord {
  const voucherUsableFrom = data.voucher_usable_from ?? null;
  const voucherExpiresAt =
    data.reward_type === "voucher" && data.created_at
      ? addMonths(new Date(data.created_at), 1).toISOString()
      : null;
  const isVoucherActive =
    data.reward_type !== "voucher" ||
    !voucherUsableFrom ||
    (new Date(voucherUsableFrom).getTime() <= Date.now() &&
      (!voucherExpiresAt || new Date(voucherExpiresAt).getTime() > Date.now()));

  return {
    id,
    name: data.name,
    phone: data.phone,
    rewardIndex: data.reward_index,
    rewardId: data.reward_id,
    rewardCode: data.reward_code ?? "",
    rewardLabel: data.reward_label,
    rewardType: data.reward_type,
    createdAt: data.created_at ?? null,
    updatedAt: data.updated_at ?? null,
    usedAt: data.used_at ?? null,
    voucherUsableFrom,
    voucherExpiresAt,
    voucherDelayMinutes: Number(data.voucher_delay_minutes ?? 0),
    status: data.status,
    isVoucherActive,
  };
}

export async function getSpinEligibilityFirebase(params: {
  name: string;
  phone: string;
}) {
  const db = getFirebaseAdminDb();
  const day = todayKey();
  const normalizedPhone = normalizeVietnamesePhone(params.phone);
  const normalizedName = normalizeCustomerName(params.name);
  const daySnap = await db
    .collection("spins")
    .where("day_key", "==", day)
    .where("phone_normalized", "==", normalizedPhone)
    .get();

  const spinsToday = daySnap.docs.filter((doc) => {
    const data = doc.data() as FirebaseSpinDoc;
    return (
      (data.name_normalized ?? normalizeCustomerName(data.name)) ===
      normalizedName
    );
  }).length;

  return {
    spinsToday,
    maxSpinsToday: 3,
    nextAvailableAt: `${day}T24:00:00.000Z`,
  };
}

export async function createSpinRecordFirebase(input: {
  name: string;
  phone: string;
  deviceFingerprint: string;
  rewardIndex: number;
  rewardId: number;
  rewardCode: string | null;
  rewardLabel: string;
  rewardType: RewardKind;
}) {
  const db = getFirebaseAdminDb();
  const now = new Date();
  const voucherUsableFrom =
    input.rewardType === "voucher" ? now.toISOString() : null;
  const voucherDelayMinutes = 0;

  const payload: FirebaseSpinDoc = {
    name: input.name,
    name_normalized: normalizeCustomerName(input.name),
    phone: input.phone,
    phone_normalized: normalizeVietnamesePhone(input.phone),
    device_fingerprint: input.deviceFingerprint,
    reward_index: input.rewardIndex,
    reward_id: input.rewardId,
    reward_code: input.rewardCode,
    reward_label: input.rewardLabel,
    reward_type: input.rewardType,
    status: "unused",
    voucher_delay_minutes: voucherDelayMinutes,
    voucher_usable_from: voucherUsableFrom,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    used_at: null,
    day_key: todayKey(),
    used_day_key: null,
  };

  const ref = await db.collection("spins").add(payload);

  return {
    id: ref.id,
    voucherDelayMinutes,
    voucherUsableFrom,
    voucherExpiresAt: voucherUsableFrom
      ? addMonths(new Date(voucherUsableFrom), 1).toISOString()
      : null,
  };
}

export async function consumeRewardFirebase(params: {
  phone: string;
  rewardId: number;
}) {
  const db = getFirebaseAdminDb();
  const normalizedPhone = normalizeVietnamesePhone(params.phone);
  const day = todayKey();

  const usedToday = await db
    .collection("spins")
    .where("phone_normalized", "==", normalizedPhone)
    .where("status", "==", "used")
    .where("used_day_key", "==", day)
    .get();

  if (usedToday.size >= 3) {
    throw new Error("REWARD_DAILY_USAGE_LIMIT");
  }

  const rewards = await db
    .collection("spins")
    .where("phone_normalized", "==", normalizedPhone)
    .where("reward_id", "==", params.rewardId)
    .where("status", "==", "unused")
    .get();

  for (const doc of rewards.docs) {
    const record = toSpinRecord(doc.id, doc.data() as FirebaseSpinDoc);
    if (record.rewardType === "voucher" && !record.isVoucherActive) {
      continue;
    }

    const usedAt = new Date().toISOString();
    await doc.ref.update({
      status: "used",
      used_at: usedAt,
      used_day_key: day,
      updated_at: FieldValue.serverTimestamp(),
    });

    return {
      ...record,
      status: "used" as const,
      usedAt,
    };
  }

  return null;
}
