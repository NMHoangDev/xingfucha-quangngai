import { NextRequest, NextResponse } from "next/server";

import {
  getVoucherActivationDelayMinutes,
  setVoucherActivationDelayMinutes,
} from "@/lib/spins/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const voucherActivationDelayMinutes =
      await getVoucherActivationDelayMinutes();

    return NextResponse.json({
      voucherActivationDelayMinutes,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to load settings", detail },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = Number(body?.voucherActivationDelayMinutes);

    if (!Number.isFinite(parsed) || parsed < 0) {
      return NextResponse.json(
        { error: "voucherActivationDelayMinutes must be a non-negative number" },
        { status: 400 },
      );
    }

    const voucherActivationDelayMinutes =
      await setVoucherActivationDelayMinutes(parsed);

    return NextResponse.json({
      success: true,
      voucherActivationDelayMinutes,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to update settings", detail },
      { status: 500 },
    );
  }
}
