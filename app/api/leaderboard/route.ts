import { NextRequest, NextResponse } from "next/server";

import {
  createGameScore,
  listTopGameScores,
  type GameType,
} from "@/lib/game/score.store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isGameType(value: string): value is GameType {
  return value === "spinup" || value === "topping_catch";
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const gameTypeRaw = (
      searchParams.get("gameType") ?? "topping_catch"
    ).trim();
    const limit = toInt(searchParams.get("limit"), 10);

    if (!isGameType(gameTypeRaw)) {
      return NextResponse.json({ error: "Invalid gameType" }, { status: 400 });
    }

    const data = await listTopGameScores({ gameType: gameTypeRaw, limit });
    return NextResponse.json({ data });
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard", detail },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const gameType = String(body?.gameType ?? "").trim();
    const name = String(body?.name ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const score = Number(body?.score ?? 0);
    const level = Number(body?.level ?? 1);
    const livesLeft = Number(body?.livesLeft ?? 0);

    if (!isGameType(gameType)) {
      return NextResponse.json({ error: "Invalid gameType" }, { status: 400 });
    }

    if (!name || !phone) {
      return NextResponse.json(
        { error: "Missing name or phone" },
        { status: 400 },
      );
    }

    if (!Number.isFinite(score) || score < 0) {
      return NextResponse.json({ error: "Invalid score" }, { status: 400 });
    }

    const created = await createGameScore({
      gameType,
      name,
      phone,
      score,
      level: Number.isFinite(level) ? level : 1,
      livesLeft: Number.isFinite(livesLeft) ? livesLeft : 0,
    });

    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to save score", detail },
      { status: 500 },
    );
  }
}
