import { google, sheets_v4 } from "googleapis";

import { createDefaultRng } from "@/lib/rewards/reward.service";
import { REWARDS } from "@/lib/rewards/rewards";
import { PLAY_SESSION_MISMATCH_MESSAGE } from "./play-session-constants";
import type {
  CampaignRecord,
  DeviceUserRecord,
  LocationRecord,
  PrizeRecord,
  RewardType,
  SpinLogRecord,
  VoucherRecord,
} from "./types";

/**
 * Tên tab trong Google Spreadsheet — phải khớp chính xác (không khoảng trắng đầu/cuối).
 * Tab trong file của bạn: locations → campaigns → users → prizes → spin_logs → vouchers
 *
 * Có thể override từng tab qua env (giá trị được trim):
 * GOOGLE_SHEETS_TAB_LOCATIONS, *_CAMPAIGNS, *_USERS, *_PRIZES, *_SPIN_LOGS, *_VOUCHERS
 */
function sheetTabFromEnv(envSuffix: string, fallback: string): string {
  const raw = process.env[`GOOGLE_SHEETS_TAB_${envSuffix}`]?.trim();
  return raw || fallback;
}

const SHEET_TABS = {
  locations: sheetTabFromEnv("LOCATIONS", "locations"),
  campaigns: sheetTabFromEnv("CAMPAIGNS", "campaigns"),
  users: sheetTabFromEnv("USERS", "users"),
  prizes: sheetTabFromEnv("PRIZES", "prizes"),
  spin_logs: sheetTabFromEnv("SPIN_LOGS", "spin_logs"),
  vouchers: sheetTabFromEnv("VOUCHERS", "vouchers"),
} as const;

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const DAILY_SPIN_LIMIT_PER_DEVICE = 3;
const DAILY_VOUCHER_USE_LIMIT_PER_DEVICE = 3;

type EligibilityResult =
  | {
      eligible: true;
      location: LocationRecord;
      campaign: CampaignRecord;
      message: string;
      spinsUsedToday: number;
      maxSpinsToday: number;
    }
  | {
      eligible: false;
      code:
        | "INVALID_LOCATION"
        | "CAMPAIGN_NOT_STARTED"
        | "CAMPAIGN_ENDED"
        | "DAILY_DEVICE_LIMIT_REACHED"
        | "SESSION_MISMATCH";
      message: string;
      location?: LocationRecord;
      campaign?: CampaignRecord;
      nextAvailableAt?: string;
      spinsUsedToday?: number;
      maxSpinsToday?: number;
    };

type SpinInput = {
  visitorId: string;
  locationId: string;
  customerName: string;
  customerPhone: string;
  sessionId: string;
};

export type PlaySessionValidateResult =
  | { ok: true }
  | { ok: false; code: "SESSION_MISMATCH"; message: string };

type SpinResult = {
  spinLog: SpinLogRecord;
  voucher: VoucherRecord | null;
  limits: {
    spinsUsedToday: number;
    maxSpinsToday: number;
  };
};

type RedeemResult =
  | {
      success: true;
      voucher: VoucherRecord;
    }
  | {
      success: false;
      code:
        | "VOUCHER_NOT_FOUND"
        | "VOUCHER_LOCATION_MISMATCH"
        | "VOUCHER_ALREADY_USED"
        | "VOUCHER_EXPIRED"
        | "VOUCHER_DAILY_DEVICE_LIMIT"
        | "MISSING_VISITOR_ID"
        | "SESSION_MISMATCH";
      message: string;
    };

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

function getDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
}

function toBoolean(value: string | undefined, fallback = true): boolean {
  if (!value) return fallback;
  return value.trim().toLowerCase() === "true";
}

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseIsoDate(value: string | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function parseSheetRows(response: sheets_v4.Schema$ValueRange): string[][] {
  const values = response.values ?? [];
  if (!values.length) return [];
  return values.slice(1).map((row) => row.map((cell) => String(cell ?? "")));
}

const FIXED_REWARD_BY_ID = new Map(REWARDS.map((reward) => [reward.id, reward]));

let sheetsClient: sheets_v4.Sheets | null = null;

async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  if (sheetsClient) return sheetsClient;

  const keyFilePath =
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH?.trim() ||
    "storage/permission/crawllinkedinapp-2e203d199c52.json";

  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: SCOPES,
  });
  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

async function readSheet(tabName: string): Promise<string[][]> {
  const spreadsheetId = requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A:Z`,
  });
  return parseSheetRows(res.data);
}

async function appendRow(tabName: string, values: string[]): Promise<void> {
  const spreadsheetId = requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tabName}!A:Z`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

async function updateVoucherStatusRow(params: {
  rowIndex: number;
  status: "unused" | "used";
  usedAt: string | null;
}): Promise<void> {
  const spreadsheetId = requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_TABS.vouchers}!K${params.rowIndex}:K${params.rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[params.status]],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_TABS.vouchers}!N${params.rowIndex}:N${params.rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[params.usedAt ?? ""]],
    },
  });
}

async function updateUserRow(params: {
  rowIndex: number;
  customerName: string;
  customerPhone: string;
  lastSeenAt: string;
}): Promise<void> {
  const spreadsheetId = requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
  const sheets = await getSheetsClient();
  /** Tab users: C = customer_phone, D = customer_name, F = last_seen_at */
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_TABS.users}!C${params.rowIndex}:D${params.rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[params.customerPhone, params.customerName]],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_TABS.users}!F${params.rowIndex}:F${params.rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[params.lastSeenAt]],
    },
  });
}

async function updateUserSessionCell(
  rowIndex: number,
  sessionId: string,
): Promise<void> {
  const spreadsheetId = requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
  const sheets = await getSheetsClient();
  /** Tab users: A = session_id */
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_TABS.users}!A${rowIndex}:A${rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[sessionId]],
    },
  });
}

async function listLocations(): Promise<LocationRecord[]> {
  const rows = await readSheet(SHEET_TABS.locations);
  return rows
    .map((row) => ({
      locationId: normalizeId(row[0] ?? ""),
      locationName: String(row[1] ?? "").trim(),
      active: toBoolean(row[2], true),
    }))
    .filter((row) => row.locationId.length > 0);
}

async function listCampaigns(): Promise<CampaignRecord[]> {
  const rows = await readSheet(SHEET_TABS.campaigns);
  return rows
    .map((row) => ({
      campaignId: normalizeId(row[0] ?? ""),
      locationId: normalizeId(row[1] ?? ""),
      campaignName: String(row[2] ?? "").trim(),
      spinStart: parseIsoDate(row[3]),
      spinEnd: parseIsoDate(row[4]),
      active: toBoolean(row[5], true),
    }))
    .filter((row) => row.campaignId && row.locationId && row.spinStart && row.spinEnd);
}

async function listPrizes(): Promise<PrizeRecord[]> {
  const rows = await readSheet(SHEET_TABS.prizes);
  return rows
    .map((row) => ({
      rewardId: toNumber(row[0], -1),
      locationId: normalizeId(row[1] ?? ""),
      campaignId: normalizeId(row[2] ?? ""),
      weight: toNumber(row[3], 0),
    }))
    .filter(
      (row) =>
        row.rewardId >= 0 &&
        row.locationId.length > 0 &&
        row.campaignId.length > 0 &&
        FIXED_REWARD_BY_ID.has(row.rewardId) &&
        row.weight > 0,
    );
}

async function listSpinLogs(): Promise<SpinLogRecord[]> {
  const rows = await readSheet(SHEET_TABS.spin_logs);
  return rows
    .map((row) => ({
      spinLogId: String(row[0] ?? "").trim(),
      visitorId: String(row[1] ?? "").trim(),
      locationId: normalizeId(row[2] ?? ""),
      campaignId: normalizeId(row[3] ?? ""),
      rewardId: toNumber(row[4], -1),
      rewardLabel: String(row[5] ?? "").trim(),
      rewardType: (String(row[6] ?? "voucher").trim() as RewardType) || "voucher",
      rewardCode: String(row[7] ?? "").trim() || null,
      customerName: String(row[8] ?? "").trim(),
      customerPhone: String(row[9] ?? "").trim(),
      createdAt: parseIsoDate(row[10]),
      dayKey: String(row[11] ?? "").trim(),
    }))
    .filter((row) => row.spinLogId && row.visitorId && row.locationId && row.dayKey);
}

async function listVouchersWithRows(): Promise<Array<{ rowIndex: number; value: VoucherRecord }>> {
  const rawRows = await readSheet(SHEET_TABS.vouchers);
  return rawRows
    .map((row, index) => ({
      rowIndex: index + 2,
      value: {
        voucherCode: String(row[0] ?? "").trim(),
        spinLogId: String(row[1] ?? "").trim(),
        locationId: normalizeId(row[2] ?? ""),
        campaignId: normalizeId(row[3] ?? ""),
        visitorId: String(row[4] ?? "").trim(),
        rewardId: toNumber(row[5], -1),
        rewardLabel: String(row[6] ?? "").trim(),
        rewardCode: String(row[7] ?? "").trim() || null,
        customerName: String(row[8] ?? "").trim(),
        customerPhone: String(row[9] ?? "").trim(),
        status: (String(row[10] ?? "unused").trim() as "unused" | "used") || "unused",
        issuedAt: parseIsoDate(row[11]),
        expireAt: parseIsoDate(row[12]) || null,
        usedAt: parseIsoDate(row[13]) || null,
      },
    }))
    .filter((item) => item.value.voucherCode.length > 0);
}

async function listUsersWithRows(): Promise<
  Array<{ rowIndex: number; value: DeviceUserRecord }>
> {
  const rows = await readSheet(SHEET_TABS.users);
  /**
   * Tab users chuẩn file XingFuCha:
   * A session_id | B visitor_id | C customer_phone | D customer_name |
   * E first_seen_at | F last_seen_at
   */
  return rows
    .map((row, index) => ({
      rowIndex: index + 2,
      value: {
        sessionId: String(row[0] ?? "").trim(),
        visitorId: String(row[1] ?? "").trim(),
        customerPhone: String(row[2] ?? "").trim(),
        customerName: String(row[3] ?? "").trim(),
        firstSeenAt: parseIsoDate(row[4]),
        lastSeenAt: parseIsoDate(row[5]),
      },
    }))
    .filter((item) => item.value.visitorId.length > 0);
}

/**
 * - Chưa có visitor_id trên sheet → coi lần đầu: luôn ok (ghi dòng khi client đã có session).
 * - Có visitor nhưng sheet chưa có session_id → ok; khi client gửi session thì ghi cột A (khóa phiên).
 * - Sheet đã có session_id (cột A) → client phải gửi đúng; thiếu hoặc sai → gian lận (tab ẩn danh ↔ thường).
 */
export async function validateOrBindPlaySession(params: {
  visitorId: string;
  sessionId?: string;
}): Promise<PlaySessionValidateResult> {
  const visitorId = params.visitorId.trim();
  const sessionId = (params.sessionId ?? "").trim();

  if (!visitorId) {
    return {
      ok: false,
      code: "SESSION_MISMATCH",
      message: PLAY_SESSION_MISMATCH_MESSAGE,
    };
  }

  const users = await listUsersWithRows();
  const existed = users.find((item) => item.value.visitorId === visitorId);

  if (!existed) {
    if (sessionId) {
      const nowIso = new Date().toISOString();
      /** A session_id | B visitor_id | C phone | D name | E first_seen | F last_seen */
      await appendRow(SHEET_TABS.users, [
        sessionId,
        visitorId,
        "",
        "",
        nowIso,
        nowIso,
      ]);
    }
    return { ok: true };
  }

  const stored = existed.value.sessionId.trim();
  if (!stored) {
    if (sessionId) {
      await updateUserSessionCell(existed.rowIndex, sessionId);
    }
    return { ok: true };
  }

  if (!sessionId || stored !== sessionId) {
    return {
      ok: false,
      code: "SESSION_MISMATCH",
      message: PLAY_SESSION_MISMATCH_MESSAGE,
    };
  }

  return { ok: true };
}

async function touchDeviceUser(params: {
  visitorId: string;
  customerName: string;
  customerPhone: string;
  sessionId: string;
}): Promise<void> {
  const visitorId = params.visitorId.trim();
  if (!visitorId) return;
  const nowIso = new Date().toISOString();
  const sessionId = params.sessionId.trim();
  const users = await listUsersWithRows();
  const existed = users.find((item) => item.value.visitorId === visitorId);

  if (!existed) {
    await appendRow(SHEET_TABS.users, [
      sessionId,
      visitorId,
      params.customerPhone.trim(),
      params.customerName.trim(),
      nowIso,
      nowIso,
    ]);
    return;
  }

  const nextName = params.customerName.trim() || existed.value.customerName;
  const nextPhone = params.customerPhone.trim() || existed.value.customerPhone;
  await updateUserRow({
    rowIndex: existed.rowIndex,
    customerName: nextName,
    customerPhone: nextPhone,
    lastSeenAt: nowIso,
  });
}

/** Chi nhánh + campaign + lượt quay/ngày — không đọc session (đã kiểm tra trước đó). */
async function checkSpinEligibilityCore(params: {
  visitorId: string;
  locationId: string;
  now?: Date;
}): Promise<EligibilityResult> {
  const visitorId = params.visitorId.trim();
  const locationId = normalizeId(params.locationId);
  const now = params.now ?? new Date();
  const nowMs = now.getTime();

  const locations = await listLocations();
  const location = locations.find(
    (item) => item.locationId === locationId && item.active,
  );

  if (!location) {
    return {
      eligible: false,
      code: "INVALID_LOCATION",
      message: "Chi nhánh không hợp lệ hoặc đã bị tắt.",
    };
  }

  const campaigns = await listCampaigns();
  const sameLocationCampaigns = campaigns
    .filter((campaign) => campaign.locationId === locationId && campaign.active)
    .sort((a, b) => new Date(a.spinStart).getTime() - new Date(b.spinStart).getTime());

  const activeCampaign = sameLocationCampaigns.find((campaign) => {
    const startMs = new Date(campaign.spinStart).getTime();
    const endMs = new Date(campaign.spinEnd).getTime();
    return startMs <= nowMs && nowMs <= endMs;
  });

  if (!activeCampaign) {
    const nextCampaign = sameLocationCampaigns.find(
      (campaign) => new Date(campaign.spinStart).getTime() > nowMs,
    );
    if (nextCampaign) {
      return {
        eligible: false,
        code: "CAMPAIGN_NOT_STARTED",
        message: "Chương trình chưa bắt đầu.",
        location,
        campaign: nextCampaign,
        nextAvailableAt: nextCampaign.spinStart,
        maxSpinsToday: DAILY_SPIN_LIMIT_PER_DEVICE,
        spinsUsedToday: 0,
      };
    }
    return {
      eligible: false,
      code: "CAMPAIGN_ENDED",
      message: "Chương trình đã kết thúc.",
      location,
      maxSpinsToday: DAILY_SPIN_LIMIT_PER_DEVICE,
      spinsUsedToday: 0,
    };
  }

  const spinLogs = await listSpinLogs();
  const today = getDayKey(now);
  const spinsToday = spinLogs.filter(
    (item) =>
      item.visitorId === visitorId &&
      item.dayKey === today,
  ).length;

  if (spinsToday >= DAILY_SPIN_LIMIT_PER_DEVICE) {
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);
    return {
      eligible: false,
      code: "DAILY_DEVICE_LIMIT_REACHED",
      message: `Thiết bị này đã dùng hết ${DAILY_SPIN_LIMIT_PER_DEVICE} lượt quay hôm nay.`,
      location,
      campaign: activeCampaign,
      nextAvailableAt: tomorrow.toISOString(),
      spinsUsedToday: spinsToday,
      maxSpinsToday: DAILY_SPIN_LIMIT_PER_DEVICE,
    };
  }

  return {
    eligible: true,
    message: "Hợp lệ để quay.",
    location,
    campaign: activeCampaign,
    spinsUsedToday: spinsToday,
    maxSpinsToday: DAILY_SPIN_LIMIT_PER_DEVICE,
  };
}

/**
 * Một vòng: (1) đọc sheet users — validate/bind session — fail sớm nếu gian lận;
 * (2) chỉ khi có locationId mới đọc locations/campaigns/spin_logs.
 */
export async function spinPageInit(params: {
  visitorId: string;
  sessionId?: string;
  locationId?: string;
  now?: Date;
}): Promise<
  | { sessionOk: false; sessionError: string }
  | { sessionOk: true; eligibility?: EligibilityResult }
> {
  const visitorId = params.visitorId.trim();
  const sessionCheck = await validateOrBindPlaySession({
    visitorId,
    sessionId: params.sessionId,
  });
  if (!sessionCheck.ok) {
    return {
      sessionOk: false,
      sessionError: sessionCheck.message,
    };
  }

  const locationRaw = params.locationId?.trim();
  if (!locationRaw) {
    return { sessionOk: true };
  }

  const eligibility = await checkSpinEligibilityCore({
    visitorId,
    locationId: locationRaw,
    now: params.now,
  });
  return { sessionOk: true, eligibility };
}

export async function checkSpinEligibility(params: {
  visitorId: string;
  locationId: string;
  sessionId?: string;
  now?: Date;
}): Promise<EligibilityResult> {
  const visitorId = params.visitorId.trim();
  const sessionCheck = await validateOrBindPlaySession({
    visitorId,
    sessionId: params.sessionId,
  });
  if (!sessionCheck.ok) {
    return {
      eligible: false,
      code: "SESSION_MISMATCH",
      message: sessionCheck.message,
    };
  }

  return checkSpinEligibilityCore({
    visitorId,
    locationId: params.locationId,
    now: params.now,
  });
}

function pickPrize(prizes: PrizeRecord[]): PrizeRecord {
  const totalWeight = prizes.reduce((sum, item) => sum + item.weight, 0);
  const rng = createDefaultRng();
  const lucky = rng() * totalWeight;
  let acc = 0;
  for (const prize of prizes) {
    acc += prize.weight;
    if (lucky <= acc) return prize;
  }
  return prizes[prizes.length - 1]!;
}

export async function doSpinAndPersist(params: SpinInput): Promise<SpinResult> {
  const eligibility = await checkSpinEligibility({
    visitorId: params.visitorId,
    locationId: params.locationId,
    sessionId: params.sessionId,
  });
  if (!eligibility.eligible) {
    throw new Error(eligibility.code);
  }

  const locationId = normalizeId(params.locationId);
  const campaignId = eligibility.campaign.campaignId;
  const prizes = (await listPrizes()).filter(
    (item) => item.locationId === locationId && item.campaignId === campaignId,
  );
  if (!prizes.length) {
    throw new Error("NO_PRIZE_CONFIGURED");
  }

  const selectedPrize = pickPrize(prizes);
  const fixedReward = FIXED_REWARD_BY_ID.get(selectedPrize.rewardId);
  if (!fixedReward) {
    throw new Error("INVALID_REWARD_ID");
  }
  const createdAt = new Date().toISOString();
  const spinLogId = `spin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const spinLog: SpinLogRecord = {
    spinLogId,
    visitorId: params.visitorId.trim(),
    locationId,
    campaignId,
    rewardId: selectedPrize.rewardId,
    rewardLabel: fixedReward.label,
    rewardType: fixedReward.type as RewardType,
    rewardCode: fixedReward.code ?? null,
    customerName: params.customerName.trim(),
    customerPhone: params.customerPhone.trim(),
    createdAt,
    dayKey: getDayKey(new Date(createdAt)),
  };

  await appendRow(SHEET_TABS.spin_logs, [
    spinLog.spinLogId,
    spinLog.visitorId,
    spinLog.locationId,
    spinLog.campaignId,
    String(spinLog.rewardId),
    spinLog.rewardLabel,
    spinLog.rewardType,
    spinLog.rewardCode ?? "",
    spinLog.customerName,
    spinLog.customerPhone,
    spinLog.createdAt,
    spinLog.dayKey,
  ]);

  await touchDeviceUser({
    visitorId: spinLog.visitorId,
    customerName: spinLog.customerName,
    customerPhone: spinLog.customerPhone,
    sessionId: params.sessionId.trim(),
  });

  if (fixedReward.type !== "voucher") {
    return {
      spinLog,
      voucher: null,
      limits: {
        spinsUsedToday: Math.min(
          DAILY_SPIN_LIMIT_PER_DEVICE,
          eligibility.spinsUsedToday + 1,
        ),
        maxSpinsToday: DAILY_SPIN_LIMIT_PER_DEVICE,
      },
    };
  }

  const voucherCode = `XFC-${locationId.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const expireAt = new Date();
  expireAt.setMonth(expireAt.getMonth() + 1);
  const voucher: VoucherRecord = {
    voucherCode,
    spinLogId,
    locationId,
    campaignId,
    visitorId: spinLog.visitorId,
    rewardId: selectedPrize.rewardId,
    rewardLabel: fixedReward.label,
    rewardCode: fixedReward.code ?? null,
    customerName: spinLog.customerName,
    customerPhone: spinLog.customerPhone,
    status: "unused",
    issuedAt: createdAt,
    expireAt: expireAt.toISOString(),
    usedAt: null,
  };

  await appendRow(SHEET_TABS.vouchers, [
    voucher.voucherCode,
    voucher.spinLogId,
    voucher.locationId,
    voucher.campaignId,
    voucher.visitorId,
    String(voucher.rewardId),
    voucher.rewardLabel,
    voucher.rewardCode ?? "",
    voucher.customerName,
    voucher.customerPhone,
    voucher.status,
    voucher.issuedAt,
    voucher.expireAt ?? "",
    voucher.usedAt ?? "",
  ]);

  return {
    spinLog,
    voucher,
    limits: {
      spinsUsedToday: Math.min(
        DAILY_SPIN_LIMIT_PER_DEVICE,
        eligibility.spinsUsedToday + 1,
      ),
      maxSpinsToday: DAILY_SPIN_LIMIT_PER_DEVICE,
    },
  };
}

export async function redeemVoucherByCode(params: {
  voucherCode: string;
  locationId: string;
  visitorId: string;
  sessionId?: string;
}): Promise<RedeemResult> {
  const voucherCode = params.voucherCode.trim();
  const locationId = normalizeId(params.locationId);
  const visitorId = params.visitorId.trim();
  const sessionId = (params.sessionId ?? "").trim();
  if (!visitorId) {
    return {
      success: false,
      code: "MISSING_VISITOR_ID",
      message: "Thiếu thông tin thiết bị để dùng voucher.",
    };
  }
  const sessionCheck = await validateOrBindPlaySession({
    visitorId,
    sessionId,
  });
  if (!sessionCheck.ok) {
    return {
      success: false,
      code: "SESSION_MISMATCH",
      message: sessionCheck.message,
    };
  }
  const vouchers = await listVouchersWithRows();
  const matched = vouchers.find((item) => item.value.voucherCode === voucherCode);
  if (!matched) {
    return {
      success: false,
      code: "VOUCHER_NOT_FOUND",
      message: "Không tìm thấy voucher.",
    };
  }

  if (matched.value.locationId !== locationId) {
    return {
      success: false,
      code: "VOUCHER_LOCATION_MISMATCH",
      message: "Voucher không áp dụng cho chi nhánh này.",
    };
  }

  if (matched.value.status === "used") {
    return {
      success: false,
      code: "VOUCHER_ALREADY_USED",
      message: "Voucher đã được sử dụng.",
    };
  }

  if (matched.value.expireAt && new Date(matched.value.expireAt).getTime() < Date.now()) {
    return {
      success: false,
      code: "VOUCHER_EXPIRED",
      message: "Voucher đã hết hạn.",
    };
  }

  const today = getDayKey(new Date());
  const usedTodayCount = vouchers.filter((item) => {
    if (item.value.status !== "used") return false;
    if (item.value.visitorId !== visitorId) return false;
    if (!item.value.usedAt) return false;
    return getDayKey(new Date(item.value.usedAt)) === today;
  }).length;

  if (usedTodayCount >= DAILY_VOUCHER_USE_LIMIT_PER_DEVICE) {
    return {
      success: false,
      code: "VOUCHER_DAILY_DEVICE_LIMIT",
      message: `Thiết bị này đã dùng hết ${DAILY_VOUCHER_USE_LIMIT_PER_DEVICE} voucher hôm nay.`,
    };
  }

  const usedAt = new Date().toISOString();
  await updateVoucherStatusRow({
    rowIndex: matched.rowIndex,
    status: "used",
    usedAt,
  });

  return {
    success: true,
    voucher: {
      ...matched.value,
      status: "used",
      usedAt,
    },
  };
}
