import { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

import { getMysqlPool, queryRows } from "@/lib/mysql";

export type SpinStatus = "used" | "unused";
export type RewardKind = "voucher" | "item";

export type SpinRecord = {
  id: string;
  name: string;
  phone: string;
  rewardIndex: number;
  rewardId: number;
  rewardCode: string;
  rewardLabel: string;
  rewardType: RewardKind;
  createdAt: string | null;
  updatedAt: string | null;
  usedAt: string | null;
  voucherUsableFrom: string | null;
  voucherExpiresAt: string | null;
  voucherDelayMinutes: number;
  status: SpinStatus;
  isVoucherActive: boolean;
};

export type CreateSpinInput = {
  name: string;
  phone: string;
  deviceFingerprint: string;
  rewardIndex: number;
  rewardId: number;
  rewardCode: string | null;
  rewardLabel: string;
  rewardType: RewardKind;
};

export type SpinEligibility = {
  spinsToday: number;
  maxSpinsToday: number;
  nextAvailableAt: string;
};

type SpinRow = RowDataPacket & {
  id: number | string;
  name: string;
  phone: string;
  reward_index: number;
  reward_id: number;
  reward_code: string | null;
  reward_label: string;
  reward_type: RewardKind;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  used_at: Date | string | null;
  voucher_usable_from: Date | string | null;
  voucher_delay_minutes: number;
  status: SpinStatus;
};

type CountRow = RowDataPacket & {
  total: number;
};

type SettingRow = RowDataPacket & {
  setting_value: string;
};

const VOUCHER_DELAY_KEY = "voucher_activation_delay_minutes";
const DAILY_SPIN_LIMIT_PER_CUSTOMER = 3;
const DAILY_USAGE_LIMIT = 3;

export function normalizeVietnamesePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("84") && digits.length === 11) {
    return digits;
  }

  if (digits.startsWith("0") && digits.length === 10) {
    return `84${digits.slice(1)}`;
  }

  return digits;
}

export function normalizeCustomerName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi-VN");
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function getStartOfTodayLocal(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getStartOfTomorrowLocal(): Date {
  return addDays(getStartOfTodayLocal(), 1);
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function mapSpinRow(row: SpinRow): SpinRecord {
  const voucherUsableFrom = toIso(row.voucher_usable_from);
  const createdAtIso = toIso(row.created_at);
  const voucherExpiresAt =
    row.reward_type === "voucher" && createdAtIso
      ? addMonths(new Date(createdAtIso), 1).toISOString()
      : null;
  const isVoucherActive =
    row.reward_type !== "voucher" ||
    !voucherUsableFrom ||
    (new Date(voucherUsableFrom).getTime() <= Date.now() &&
      (!voucherExpiresAt || new Date(voucherExpiresAt).getTime() > Date.now()));

  return {
    id: String(row.id),
    name: row.name ?? "",
    phone: row.phone ?? "",
    rewardIndex: Number(row.reward_index ?? 0),
    rewardId: Number(row.reward_id ?? 0),
    rewardCode: row.reward_code ?? "",
    rewardLabel: row.reward_label ?? "",
    rewardType: row.reward_type,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    usedAt: toIso(row.used_at),
    voucherUsableFrom,
    voucherExpiresAt,
    voucherDelayMinutes: Number(row.voucher_delay_minutes ?? 0),
    status: row.status === "used" ? "used" : "unused",
    isVoucherActive,
  };
}

export async function getVoucherActivationDelayMinutes(): Promise<number> {
  const rows = await queryRows<SettingRow[]>(
    `
      SELECT setting_value
      FROM app_settings
      WHERE setting_key = ?
      LIMIT 1
    `,
    [VOUCHER_DELAY_KEY],
  );

  const value = rows[0]?.setting_value;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

export async function setVoucherActivationDelayMinutes(
  minutes: number,
): Promise<number> {
  const normalized = Math.max(0, Math.floor(minutes));

  await getMysqlPool().execute<ResultSetHeader>(
    `
      INSERT INTO app_settings (setting_key, setting_value)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        setting_value = VALUES(setting_value),
        updated_at = CURRENT_TIMESTAMP
    `,
    [VOUCHER_DELAY_KEY, String(normalized)],
  );

  return normalized;
}

export async function createSpinRecord(input: CreateSpinInput): Promise<{
  id: string;
  voucherDelayMinutes: number;
  voucherUsableFrom: string | null;
  voucherExpiresAt: string | null;
}> {
  const phoneNormalized = normalizeVietnamesePhone(input.phone);

  let voucherUsableFrom: Date | null = null;
  if (input.rewardType === "voucher") {
    voucherUsableFrom = new Date();
  }

  const voucherExpiresAt = voucherUsableFrom
    ? addMonths(voucherUsableFrom, 1)
    : null;

  const voucherDelayMinutes = 0;

  const [result] = await getMysqlPool().execute<ResultSetHeader>(
    `
      INSERT INTO spins (
        name,
        phone,
        phone_normalized,
        device_fingerprint,
        reward_index,
        reward_id,
        reward_code,
        reward_label,
        reward_type,
        status,
        voucher_delay_minutes,
        voucher_usable_from
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unused', ?, ?)
    `,
    [
      input.name,
      input.phone,
      phoneNormalized,
      input.deviceFingerprint,
      input.rewardIndex,
      input.rewardId,
      input.rewardCode,
      input.rewardLabel,
      input.rewardType,
      voucherDelayMinutes,
      voucherUsableFrom,
    ],
  );

  return {
    id: String(result.insertId),
    voucherDelayMinutes,
    voucherUsableFrom: voucherUsableFrom?.toISOString() ?? null,
    voucherExpiresAt: voucherExpiresAt?.toISOString() ?? null,
  };
}

export async function getSpinEligibility(params: {
  name: string;
  phone: string;
}): Promise<SpinEligibility> {
  const todayStart = getStartOfTodayLocal();
  const tomorrowStart = getStartOfTomorrowLocal();
  const normalizedPhone = normalizeVietnamesePhone(params.phone);
  const normalizedName = normalizeCustomerName(params.name);
  const rows = await queryRows<CountRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM spins
      WHERE phone_normalized = ?
        AND LOWER(TRIM(name)) = ?
        AND created_at >= ?
        AND created_at < ?
    `,
    [normalizedPhone, normalizedName, todayStart, tomorrowStart],
  );

  const spinsToday = Number(rows[0]?.total ?? 0);

  return {
    spinsToday,
    maxSpinsToday: DAILY_SPIN_LIMIT_PER_CUSTOMER,
    nextAvailableAt: tomorrowStart.toISOString(),
  };
}

export async function listSpinRecords(params: {
  page: number;
  limit: number;
  search: string;
  type: "all" | RewardKind;
}): Promise<{ data: SpinRecord[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.type !== "all") {
    conditions.push("reward_type = ?");
    values.push(params.type);
  }

  if (params.search) {
    conditions.push("(phone LIKE ? OR LOWER(name) LIKE ?)");
    values.push(`%${params.search}%`, `%${params.search.toLowerCase()}%`);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";
  const offset = (params.page - 1) * params.limit;

  const totalRows = await queryRows<CountRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM spins
      ${whereClause}
    `,
    values,
  );

  const rows = await queryRows<SpinRow[]>(
    `
      SELECT
        id,
        name,
        phone,
        reward_index,
        reward_id,
        reward_code,
        reward_label,
        reward_type,
        created_at,
        updated_at,
        used_at,
        voucher_usable_from,
        voucher_delay_minutes,
        status
      FROM spins
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
      OFFSET ?
    `,
    [...values, params.limit, offset],
  );

  return {
    data: rows.map(mapSpinRow),
    total: Number(totalRows[0]?.total ?? 0),
  };
}

export async function getAllSpinRecords(): Promise<SpinRecord[]> {
  const rows = await queryRows<SpinRow[]>(
    `
      SELECT
        id,
        name,
        phone,
        reward_index,
        reward_id,
        reward_code,
        reward_label,
        reward_type,
        created_at,
        updated_at,
        used_at,
        voucher_usable_from,
        voucher_delay_minutes,
        status
      FROM spins
      ORDER BY created_at DESC, id DESC
    `,
  );

  return rows.map(mapSpinRow);
}

export async function updateSpinStatus(params: {
  id: string;
  status: SpinStatus;
}): Promise<SpinRecord | null> {
  const rows = await queryRows<SpinRow[]>(
    `
      SELECT
        id,
        name,
        phone,
        reward_index,
        reward_id,
        reward_code,
        reward_label,
        reward_type,
        created_at,
        updated_at,
        used_at,
        voucher_usable_from,
        voucher_delay_minutes,
        status
      FROM spins
      WHERE id = ?
      LIMIT 1
    `,
    [params.id],
  );

  const current = rows[0] ? mapSpinRow(rows[0]) : null;
  if (!current) return null;

  if (
    params.status === "used" &&
    current.rewardType === "voucher" &&
    !current.isVoucherActive
  ) {
    throw new Error("VOUCHER_NOT_ACTIVE");
  }

  if (params.status === "used") {
    const todayStart = getStartOfTodayLocal();
    const tomorrowStart = getStartOfTomorrowLocal();
    const normalizedPhone = normalizeVietnamesePhone(current.phone);

    const usedTodayRows = await queryRows<CountRow[]>(
      `
        SELECT COUNT(*) AS total
        FROM spins
        WHERE phone_normalized = ?
          AND status = 'used'
          AND used_at >= ?
          AND used_at < ?
          AND id <> ?
      `,
      [normalizedPhone, todayStart, tomorrowStart, params.id],
    );

    if (Number(usedTodayRows[0]?.total ?? 0) >= DAILY_USAGE_LIMIT) {
      throw new Error("REWARD_DAILY_USAGE_LIMIT");
    }
  }

  await getMysqlPool().execute<ResultSetHeader>(
    `
      UPDATE spins
      SET
        status = ?,
        used_at = CASE WHEN ? = 'used' THEN CURRENT_TIMESTAMP ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [params.status, params.status, params.id],
  );

  const updatedRows = await queryRows<SpinRow[]>(
    `
      SELECT
        id,
        name,
        phone,
        reward_index,
        reward_id,
        reward_code,
        reward_label,
        reward_type,
        created_at,
        updated_at,
        used_at,
        voucher_usable_from,
        voucher_delay_minutes,
        status
      FROM spins
      WHERE id = ?
      LIMIT 1
    `,
    [params.id],
  );

  return updatedRows[0] ? mapSpinRow(updatedRows[0]) : null;
}

export async function consumeRewardByPhoneAndRewardId(params: {
  phone: string;
  rewardId: number;
}): Promise<SpinRecord | null> {
  const normalizedPhone = normalizeVietnamesePhone(params.phone);
  if (!normalizedPhone) return null;

  const rows = await queryRows<SpinRow[]>(
    `
      SELECT
        id,
        name,
        phone,
        reward_index,
        reward_id,
        reward_code,
        reward_label,
        reward_type,
        created_at,
        updated_at,
        used_at,
        voucher_usable_from,
        voucher_delay_minutes,
        status
      FROM spins
      WHERE phone_normalized = ?
        AND reward_id = ?
        AND status = 'unused'
      ORDER BY created_at ASC, id ASC
    `,
    [normalizedPhone, params.rewardId],
  );

  for (const row of rows) {
    const current = mapSpinRow(row);
    if (current.rewardType === "voucher" && !current.isVoucherActive) {
      continue;
    }

    return updateSpinStatus({ id: current.id, status: "used" });
  }

  return null;
}
