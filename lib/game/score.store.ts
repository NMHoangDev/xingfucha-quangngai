import { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

import { getMysqlPool, queryRows } from "@/lib/mysql";

export type GameType = "spinup" | "topping_catch";

export type CreateGameScoreInput = {
  gameType: GameType;
  name: string;
  phone: string;
  score: number;
  level: number;
  livesLeft: number;
};

export type GameScoreRecord = {
  id: string;
  gameType: GameType;
  name: string;
  phone: string;
  score: number;
  level: number;
  livesLeft: number;
  createdAt: string | null;
};

type GameScoreRow = RowDataPacket & {
  id: number | string;
  game_type: GameType;
  name: string;
  phone: string;
  score: number;
  level: number;
  lives_left: number;
  created_at: Date | string | null;
};

function normalizeVietnamesePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("84") && digits.length === 11) {
    return digits;
  }

  if (digits.startsWith("0") && digits.length === 10) {
    return `84${digits.slice(1)}`;
  }

  return digits;
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function mapRow(row: GameScoreRow): GameScoreRecord {
  return {
    id: String(row.id),
    gameType: row.game_type,
    name: row.name ?? "",
    phone: row.phone ?? "",
    score: Number(row.score ?? 0),
    level: Number(row.level ?? 1),
    livesLeft: Number(row.lives_left ?? 0),
    createdAt: toIso(row.created_at),
  };
}

export async function createGameScore(
  input: CreateGameScoreInput,
): Promise<GameScoreRecord> {
  const phoneNormalized = normalizeVietnamesePhone(input.phone);

  const [result] = await getMysqlPool().execute<ResultSetHeader>(
    `
      INSERT INTO game_scores (
        game_type,
        name,
        phone,
        phone_normalized,
        score,
        level,
        lives_left
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.gameType,
      input.name,
      input.phone,
      phoneNormalized,
      Math.max(0, Math.floor(input.score)),
      Math.max(1, Math.floor(input.level)),
      Math.max(0, Math.floor(input.livesLeft)),
    ],
  );

  const rows = await queryRows<GameScoreRow[]>(
    `
      SELECT
        id,
        game_type,
        name,
        phone,
        score,
        level,
        lives_left,
        created_at
      FROM game_scores
      WHERE id = ?
      LIMIT 1
    `,
    [result.insertId],
  );

  if (!rows[0]) {
    throw new Error("FAILED_TO_FETCH_CREATED_SCORE");
  }

  return mapRow(rows[0]);
}

export async function listTopGameScores(params: {
  gameType: GameType;
  limit: number;
}): Promise<GameScoreRecord[]> {
  const limit = Math.min(Math.max(1, Math.floor(params.limit)), 100);

  const rows = await queryRows<GameScoreRow[]>(
    `
      SELECT
        id,
        game_type,
        name,
        phone,
        score,
        level,
        lives_left,
        created_at
      FROM game_scores
      WHERE game_type = ?
      ORDER BY score DESC, created_at ASC
      LIMIT ?
    `,
    [params.gameType, limit],
  );

  return rows.map(mapRow);
}
