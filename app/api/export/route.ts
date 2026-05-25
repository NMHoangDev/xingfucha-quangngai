import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { getAllSpinRecords } from "@/lib/spins/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TITLE = "TỔNG HỢP SỐ LƯỢNG QUAY SPIN UP TẠI XING FUCHA";

type SpinDoc = {
  name?: unknown;
  phone?: unknown;
  rewardLabel?: unknown;
  rewardCode?: unknown;
  createdAt?: unknown;
  status?: unknown;
};

type UserAggregate = {
  name: string;
  phone: string;
  totalSpins: number;
  rewards: Map<string, number>;
};

function normalizeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizePhone(v: unknown): string {
  return normalizeString(v);
}

function addToMap(map: Map<string, number>, key: string, inc: number) {
  map.set(key, (map.get(key) ?? 0) + inc);
}

function rewardSummary(rewards: Map<string, number>): string {
  const entries = Array.from(rewards.entries());
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries.map(([label, count]) => `${label} (${count})`).join(", ");
}

async function fetchAllSpins(): Promise<SpinDoc[]> {
  const rows = await getAllSpinRecords();
  return rows.map((row) => ({
    name: row.name,
    phone: row.phone,
    rewardLabel: row.rewardLabel,
    rewardCode: row.rewardCode,
    createdAt: row.createdAt,
    status: row.status,
  }));
}

function aggregateSpins(docs: SpinDoc[]) {
  const byPhone = new Map<string, UserAggregate>();
  const globalRewards = new Map<string, number>();

  let totalSpins = 0;

  for (const d of docs) {
    const phone = normalizePhone(d.phone);
    if (!phone) continue;

    const name = normalizeString(d.name);
    const rewardLabel = normalizeString(d.rewardLabel) || "(Unknown)";
    const spins = 1;
    totalSpins += 1;

    let agg = byPhone.get(phone);
    if (!agg) {
      agg = {
        name: name || "",
        phone,
        totalSpins: 0,
        rewards: new Map(),
      };
      byPhone.set(phone, agg);
    }

    if (!agg.name && name) agg.name = name;
    agg.totalSpins += spins;

    addToMap(agg.rewards, rewardLabel, spins);
    addToMap(globalRewards, rewardLabel, spins);
  }

  const users = Array.from(byPhone.values());
  users.sort((a, b) => a.phone.localeCompare(b.phone));

  const items = Array.from(globalRewards.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const totalCustomers = byPhone.size;
  const totalItems = items.reduce((s, it) => s + it.count, 0);

  return { users, items, summary: { totalCustomers, totalSpins, totalItems } };
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF3F4F6" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    };
  });
}

function styleBodyRow(row: ExcelJS.Row) {
  row.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  row.eachCell((cell) => {
    cell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    };
  });
}

async function buildWorkbook() {
  const docs = await fetchAllSpins();
  const { users, items, summary } = aggregateSpins(docs);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Spin Report");

  ws.columns = [
    { key: "name", width: 28 },
    { key: "phone", width: 18 },
    { key: "spins", width: 12 },
    { key: "items", width: 60 },
  ];

  // Keep phone numbers as text to avoid losing leading zeros.
  ws.getColumn(2).numFmt = "@";

  // Title
  ws.mergeCells("A1:D1");
  const titleCell = ws.getCell("A1");
  titleCell.value = TITLE;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 28;

  // Table 1 header
  const headerRowIndex = 3;
  const headerRow = ws.getRow(headerRowIndex);
  headerRow.values = [
    "Tên khách hàng",
    "Số điện thoại",
    "Số lần quay",
    "Item nhận được",
  ];
  styleHeaderRow(headerRow);

  // Table 1 body
  let rowIndex = headerRowIndex + 1;
  for (const u of users) {
    const r = ws.getRow(rowIndex++);
    r.values = [
      u.name,
      String(u.phone),
      u.totalSpins,
      rewardSummary(u.rewards),
    ];
    styleBodyRow(r);
  }

  // Summary block
  rowIndex += 1;

  const summaryHeader = ws.getRow(rowIndex++);
  summaryHeader.values = [
    "Tổng khách hàng",
    "Tổng lượt quay",
    "Tổng item đã tặng",
  ];
  summaryHeader.font = { bold: true };
  summaryHeader.alignment = { vertical: "middle", horizontal: "center" };

  const summaryRow = ws.getRow(rowIndex++);
  summaryRow.values = [
    summary.totalCustomers,
    summary.totalSpins,
    summary.totalItems,
  ];
  summaryRow.alignment = { vertical: "middle", horizontal: "center" };

  // Keep summary in A-C, leave D blank
  ws.getCell(`D${summaryHeader.number}`).value = "";
  ws.getCell(`D${summaryRow.number}`).value = "";

  // Table 2
  rowIndex += 2;
  const table2Header = ws.getRow(rowIndex++);
  table2Header.values = ["Tên item", "Số lượng"];
  table2Header.font = { bold: true };
  table2Header.alignment = { vertical: "middle", horizontal: "center" };

  for (const it of items) {
    const r = ws.getRow(rowIndex++);
    r.values = [it.label, it.count];
    r.alignment = { vertical: "middle", horizontal: "left" };
  }

  return wb;
}

export async function GET() {
  try {
    const wb = await buildWorkbook();
    const buffer = await wb.xlsx.writeBuffer();

    return new NextResponse(Buffer.from(buffer as ArrayBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=spin-report.xlsx",
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Failed to export", detail },
      { status: 500 },
    );
  }
}
