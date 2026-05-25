import { NextRequest, NextResponse } from "next/server";

import { redeemVoucherByCode } from "@/lib/spins/google-sheets-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const voucherCode = String(body?.voucherCode ?? "").trim();
    const locationId = String(body?.locationId ?? "").trim();
    const visitorId = String(body?.visitorId ?? "").trim();
    const sessionIdRaw = body?.sessionId;
    const sessionId =
      sessionIdRaw === undefined || sessionIdRaw === null
        ? ""
        : String(sessionIdRaw).trim();

    if (!voucherCode || !locationId || !visitorId) {
      return NextResponse.json(
        {
          error: "Missing voucherCode, locationId or visitorId",
        },
        { status: 400 },
      );
    }

    const result = await redeemVoucherByCode({
      voucherCode,
      locationId,
      visitorId,
      sessionId: sessionId || undefined,
    });
    if (!result.success) {
      return NextResponse.json(result, { status: 409 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to redeem voucher", detail },
      { status: 500 },
    );
  }
}
