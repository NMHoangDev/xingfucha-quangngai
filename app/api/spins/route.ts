import { NextRequest, NextResponse } from "next/server";

import {
  consumeRewardByPhoneAndRewardId,
  listSpinRecords,
  updateSpinStatus,
} from "@/lib/spins/store";
import { consumeRewardFirebase } from "@/lib/spins/firebase-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shouldUseFirebaseBackend() {
  return process.env.SPIN_DATA_BACKEND === "firebase";
}

function toInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = toInt(searchParams.get("page"), 1);
    const limit = Math.min(toInt(searchParams.get("limit"), 10), 100);
    const search = (searchParams.get("search") ?? "").trim();
    const type = (searchParams.get("type") ?? "all").trim() as
      | "all"
      | "voucher"
      | "item";

    const { data, total } = await listSpinRecords({
      page,
      limit,
      search,
      type,
    });

    return NextResponse.json({ data, total });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to fetch spins", detail },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, phone, rewardId, action } = body as {
      id?: string;
      status?: "used" | "unused";
      phone?: string;
      rewardId?: number;
      action?: "consume-one";
    };

    if (action === "consume-one") {
      const updated = shouldUseFirebaseBackend()
        ? await consumeRewardFirebase({
            phone: String(phone ?? ""),
            rewardId: Number(rewardId ?? -1),
          })
        : await consumeRewardByPhoneAndRewardId({
            phone: String(phone ?? ""),
            rewardId: Number(rewardId ?? -1),
          });

      if (!updated) {
        return NextResponse.json(
          { error: "Không tìm thấy voucher khả dụng để sử dụng." },
          { status: 404 },
        );
      }

      return NextResponse.json({ success: true, data: updated });
    }

    if (!id || (status !== "used" && status !== "unused")) {
      return NextResponse.json(
        { error: "Missing id or invalid status" },
        { status: 400 },
      );
    }

    const updated = await updateSpinStatus({ id, status });
    if (!updated) {
      return NextResponse.json({ error: "Spin not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    if (detail === "VOUCHER_NOT_ACTIVE") {
      return NextResponse.json(
        { error: "Voucher này chưa tới thời gian được phép sử dụng." },
        { status: 409 },
      );
    }

    if (detail === "REWARD_DAILY_USAGE_LIMIT") {
      return NextResponse.json(
        {
          error:
            "Khách hàng này đã dùng đủ 3 voucher trong hôm nay, vui lòng quay lại vào ngày mai.",
        },
        { status: 409 },
      );
    }

    if (detail.startsWith("FIREBASE_ADMIN_NOT_CONFIGURED")) {
      return NextResponse.json(
        { error: "Firebase admin chưa được cấu hình." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: "Failed to update spin", detail },
      { status: 500 },
    );
  }
}
