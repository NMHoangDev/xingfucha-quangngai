"use client";

import { useEffect, useMemo, useState } from "react";

type SpinStatus = "used" | "unused";

type SpinRecord = {
  id: string;
  name: string;
  phone: string;
  rewardCode: string;
  rewardLabel: string;
  rewardType: string;
  createdAt: string | null;
  voucherUsableFrom: string | null;
  voucherDelayMinutes: number;
  status: SpinStatus;
  isVoucherActive: boolean;
};

type SpinsResponse = {
  data: SpinRecord[];
  total: number;
};

type SettingsResponse = {
  voucherActivationDelayMinutes: number;
};

function formatDate(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("vi-VN");
  } catch {
    return iso;
  }
}

function parseNonNegativeInt(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

export default function AdminPage() {
  const [rows, setRows] = useState<SpinRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "voucher" | "item">("all");
  const [voucherDelayMinutes, setVoucherDelayMinutes] = useState(0);

  const [total, setTotal] = useState(0);

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(total / limit)),
    [total, limit],
  );

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search,
        type,
      });

      const res = await fetch(`/api/spins?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");

      const json = (await res.json()) as SpinsResponse;
      setRows(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function loadSettings() {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");

      const json = (await res.json()) as SettingsResponse;
      setVoucherDelayMinutes(json.voucherActivationDelayMinutes ?? 0);
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch settings");
    }
  }

  useEffect(() => {
    void load();
    void loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, type]);

  async function markUsed(id: string) {
    try {
      const res = await fetch("/api/spins", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "used" }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to update");
      }
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to update");
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voucherActivationDelayMinutes: voucherDelayMinutes,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to save settings");
      }
      setVoucherDelayMinutes(json.voucherActivationDelayMinutes ?? 0);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  async function exportExcel() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/export");
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Export failed");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "spin-report.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Admin - Lượt quay
            </h1>
            <p className="text-sm text-gray-600">
              Danh sách khách đã quay và phần thưởng.
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-2 md:items-center">
            <button
              onClick={() => void exportExcel()}
              className="h-10 px-4 rounded-lg border border-gray-300 bg-white"
              disabled={exporting}
            >
              {exporting ? "Đang export..." : "Export Excel"}
            </button>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên hoặc số điện thoại"
              className="h-10 px-3 rounded-lg border border-gray-300 bg-white"
            />
            <select
              value={type}
              onChange={(e) => {
                setPage(1);
                setType(e.target.value as any);
              }}
              className="h-10 px-3 rounded-lg border border-gray-300 bg-white"
            >
              <option value="all">Tất cả</option>
              <option value="voucher">Voucher</option>
              <option value="item">Quà hiện vật</option>
            </select>
            <button
              onClick={() => {
                setPage(1);
                void load();
              }}
              className="h-10 px-4 rounded-lg bg-gray-900 text-white"
              disabled={loading}
            >
              {loading ? "Đang tải..." : "Tìm"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
            {error}
          </div>
        )}

        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Cấu hình kích hoạt voucher
              </h2>
              <p className="text-sm text-gray-600">
                Voucher quay trúng sẽ chỉ dùng được sau khoảng thời gian admin
                thiết lập.
              </p>
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <input
                type="number"
                min={0}
                value={voucherDelayMinutes}
                onChange={(e) =>
                  setVoucherDelayMinutes(parseNonNegativeInt(e.target.value))
                }
                className="h-10 w-40 rounded-lg border border-gray-300 bg-white px-3"
              />
              <span className="text-sm text-gray-600">phút</span>
              <button
                onClick={() => void saveSettings()}
                className="h-10 rounded-lg bg-gray-900 px-4 text-white disabled:opacity-50"
                disabled={savingSettings}
              >
                {savingSettings ? "Đang lưu..." : "Lưu cấu hình"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="text-left px-4 py-3">Tên</th>
                  <th className="text-left px-4 py-3">SĐT</th>
                  <th className="text-left px-4 py-3">Quà</th>
                  <th className="text-left px-4 py-3">Mã</th>
                  <th className="text-left px-4 py-3">Thời gian</th>
                  <th className="text-left px-4 py-3">Hiệu lực từ</th>
                  <th className="text-left px-4 py-3">Trạng thái</th>
                  <th className="text-left px-4 py-3">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {r.name}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.phone}</td>
                    <td className="px-4 py-3 text-gray-700">{r.rewardLabel}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {r.rewardCode || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {r.rewardType === "voucher"
                        ? formatDate(r.voucherUsableFrom)
                        : "Dùng ngay"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          r.status === "used"
                            ? "inline-flex items-center px-2 py-1 rounded-md bg-green-50 text-green-700 border border-green-200"
                            : "inline-flex items-center px-2 py-1 rounded-md bg-yellow-50 text-yellow-700 border border-yellow-200"
                        }
                      >
                        {r.status === "used" ? "Đã dùng" : "Chưa dùng"}
                      </span>
                      {r.rewardType === "voucher" &&
                        r.status !== "used" &&
                        !r.isVoucherActive && (
                          <div className="mt-1 text-xs text-amber-700">
                            Chưa tới thời gian sử dụng
                          </div>
                        )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="h-9 px-3 rounded-lg border border-gray-300 bg-white disabled:opacity-50"
                        disabled={
                          loading ||
                          r.status === "used" ||
                          (r.rewardType === "voucher" && !r.isVoucherActive)
                        }
                        onClick={() => void markUsed(r.id)}
                      >
                        {r.rewardType === "voucher" && !r.isVoucherActive
                          ? "Chưa đến hạn"
                          : "Đánh dấu đã dùng"}
                      </button>
                    </td>
                  </tr>
                ))}

                {!loading && rows.length === 0 && (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-gray-500"
                      colSpan={8}
                    >
                      Không có dữ liệu.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 p-4 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              Tổng: <span className="font-medium text-gray-900">{total}</span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={limit}
                onChange={(e) => {
                  setPage(1);
                  setLimit(Number(e.target.value));
                }}
                className="h-9 px-2 rounded-lg border border-gray-300 bg-white"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>

              <button
                className="h-9 px-3 rounded-lg border border-gray-300 bg-white disabled:opacity-50"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={loading || page <= 1}
              >
                Trước
              </button>
              <div className="text-sm text-gray-700">
                Trang <span className="font-medium text-gray-900">{page}</span>{" "}
                / {pageCount}
              </div>
              <button
                className="h-9 px-3 rounded-lg border border-gray-300 bg-white disabled:opacity-50"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={loading || page >= pageCount}
              >
                Sau
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
