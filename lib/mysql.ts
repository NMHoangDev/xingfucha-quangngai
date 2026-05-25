import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";

declare global {
  var __mysqlPool: Pool | undefined;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required MySQL environment variable: ${name}`);
  }
  return value;
}

export function getMysqlPool(): Pool {
  if (global.__mysqlPool) {
    return global.__mysqlPool;
  }

  const portRaw = process.env.MYSQL_PORT?.trim();
  const port = portRaw ? Number(portRaw) : 3306;

  global.__mysqlPool = mysql.createPool({
    host: requireEnv("MYSQL_HOST"),
    port: Number.isFinite(port) ? port : 3306,
    user: requireEnv("MYSQL_USER"),
    password: requireEnv("MYSQL_PASSWORD"),
    database: requireEnv("MYSQL_DATABASE"),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4",
  });

  return global.__mysqlPool;
}

export async function queryRows<T extends RowDataPacket[]>(
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const [rows] = await getMysqlPool().query<T>(sql, params);
  return rows;
}
