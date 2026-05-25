import { NextRequest, NextResponse } from "next/server";

import { doSpinAndPersist } from "@/lib/spins/google-sheets-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const visitorId = String(body?.visitorId ?? "").trim();
    const locationId = String(body?.locationId ?? "").trim();
    const name = String(body?.name ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const sessionId = String(body?.sessionId ?? "").trim();

    if (!visitorId || !locationId || !name || !phone || !sessionId) {
      return NextResponse.json(
        {
          error: "Missing visitorId, locationId, name, phone or sessionId",
        },
        { status: 400 },
      );
    }

    const result = await doSpinAndPersist({
      visitorId,
      locationId,
      customerName: name,
      customerPhone: phone,
      sessionId,
    });

    return NextResponse.json({
      success: true,
      spinLogId: result.spinLog.spinLogId,
      reward: {
        id: result.spinLog.rewardId,
        label: result.spinLog.rewardLabel,
        type: result.spinLog.rewardType,
        code: result.spinLog.rewardCode,
      },
      voucher: result.voucher,
      campaignId: result.spinLog.campaignId,
      locationId: result.spinLog.locationId,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const mapStatus: Record<string, number> = {
      INVALID_LOCATION: 409,
      CAMPAIGN_NOT_STARTED: 409,
      CAMPAIGN_ENDED: 409,
      ALREADY_SPUN_TODAY: 409,
      SESSION_MISMATCH: 403,
      NO_PRIZE_CONFIGURED: 500,
    };
    return NextResponse.json(
      {
        error: "Failed to spin",
        code: detail,
      },
      { status: mapStatus[detail] ?? 500 },
    );
  }
}
