import { NextRequest, NextResponse } from "next/server";

import { PLAY_SESSION_MISMATCH_MESSAGE } from "@/lib/spins/play-session-constants";
import { doSpinAndPersist } from "@/lib/spins/google-sheets-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const visitorId = String(
      body?.visitorId ?? body?.deviceFingerprint ?? "",
    ).trim();
    const locationId = String(body?.locationId ?? "").trim();
    const sessionId = String(body?.sessionId ?? "").trim();

    if (!name || !phone || !visitorId || !locationId || !sessionId) {
      return NextResponse.json(
        {
          error: "Missing name, phone, visitorId, locationId or sessionId",
        },
        { status: 400 },
      );
    }

    const spin = await doSpinAndPersist({
      visitorId,
      locationId,
      customerName: name,
      customerPhone: phone,
      sessionId,
    });

    return NextResponse.json({
      success: true,
      backend: "google-sheets",
      spinId: spin.spinLog.spinLogId,
      rewardIndex: spin.spinLog.rewardId,
      reward: {
        id: spin.spinLog.rewardId,
        label: spin.spinLog.rewardLabel,
        type: spin.spinLog.rewardType,
        code: spin.spinLog.rewardCode,
        voucherDelayMinutes: 0,
        voucherUsableFrom: spin.voucher?.issuedAt ?? null,
        voucherExpiresAt: spin.voucher?.expireAt ?? null,
      },
      voucher: spin.voucher,
      limits: spin.limits,
      locationId: spin.spinLog.locationId,
      campaignId: spin.spinLog.campaignId,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail === "SESSION_MISMATCH") {
      return NextResponse.json(
        {
          code: detail,
          message: PLAY_SESSION_MISMATCH_MESSAGE,
        },
        { status: 403 },
      );
    }

    if (detail === "DAILY_DEVICE_LIMIT_REACHED") {
      return NextResponse.json(
        {
          code: detail,
          message: "Thiết bị này đã dùng hết 3 lượt quay hôm nay.",
          maxSpinsToday: 3,
          spinsUsedToday: 3,
        },
        { status: 409 },
      );
    }

    if (detail === "INVALID_LOCATION") {
      return NextResponse.json(
        { code: detail, message: "Chi nhánh không hợp lệ." },
        { status: 409 },
      );
    }

    if (detail === "CAMPAIGN_NOT_STARTED") {
      return NextResponse.json(
        { code: detail, message: "Chi nhánh chưa đến thời gian quay thưởng." },
        { status: 409 },
      );
    }

    if (detail === "CAMPAIGN_ENDED") {
      return NextResponse.json(
        { code: detail, message: "Chi nhánh đã kết thúc chương trình quay." },
        { status: 409 },
      );
    }

    const codeToStatus: Record<string, number> = {
      INVALID_LOCATION: 409,
      CAMPAIGN_NOT_STARTED: 409,
      CAMPAIGN_ENDED: 409,
      DAILY_DEVICE_LIMIT_REACHED: 409,
      SESSION_MISMATCH: 403,
      NO_PRIZE_CONFIGURED: 500,
    };
    return NextResponse.json(
      { error: "Internal Server Error", code: detail },
      { status: codeToStatus[detail] ?? 500 },
    );
  }
}
