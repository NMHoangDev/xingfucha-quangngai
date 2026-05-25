import { NextRequest, NextResponse } from "next/server";

import { spinPageInit } from "@/lib/spins/google-sheets-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Gộp kiểm tra session/device + điều kiện quay (nếu có location) trong một request. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const visitorId = String(body?.visitorId ?? "").trim();
    const sessionIdRaw = body?.sessionId;
    const sessionId =
      sessionIdRaw === undefined || sessionIdRaw === null
        ? ""
        : String(sessionIdRaw).trim();
    const locationId = String(body?.locationId ?? "").trim();

    if (!visitorId) {
      return NextResponse.json({ error: "Missing visitorId" }, { status: 400 });
    }

    const init = await spinPageInit({
      visitorId,
      sessionId: sessionId || undefined,
      locationId: locationId || undefined,
    });

    if (!init.sessionOk) {
      return NextResponse.json({
        sessionOk: false,
        sessionError: init.sessionError,
      });
    }

    if (!init.eligibility) {
      return NextResponse.json({ sessionOk: true });
    }

    const e = init.eligibility;
    if (e.eligible) {
      return NextResponse.json({
        sessionOk: true,
        eligible: true,
        message: e.message,
        spinsUsedToday: e.spinsUsedToday,
        maxSpinsToday: e.maxSpinsToday,
      });
    }

    return NextResponse.json({
      sessionOk: true,
      eligible: false,
      code: e.code,
      message: e.message,
      spinsUsedToday: e.spinsUsedToday,
      maxSpinsToday: e.maxSpinsToday,
      nextAvailableAt: e.nextAvailableAt,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to initialize spin page", detail },
      { status: 500 },
    );
  }
}
