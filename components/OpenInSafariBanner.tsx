"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import { shouldShowForcedCameraQrHint } from "@/lib/detect-ios-in-app-browser";

/** Người dùng xác nhận đã vào Safari/Camera — ẩn trong phiên tab (không có nút X / đóng nhanh). */
const ESCAPE_KEY = "xfc-scanner-camera-hint-escape";

export default function OpenInSafariBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(ESCAPE_KEY) === "1") return;
      const params = new URLSearchParams(window.location.search);
      const fromQr = params.get("from_qr") === "1";
      if (shouldShowForcedCameraQrHint(fromQr)) setVisible(true);
    } catch {
      /* empty */
    }
  }, []);

  function escapeAfterConfirm() {
    try {
      sessionStorage.setItem(ESCAPE_KEY, "1");
    } catch {
      /* empty */
    }
    setVisible(false);
  }

  async function copyLink() {
    const href =
      typeof window !== "undefined" ? window.location.href : "";
    let text = href;
    try {
      const u = new URL(href);
      u.searchParams.delete("from_qr");
      text = u.toString();
    } catch {
      /* giữ href */
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        /* empty */
      }
    }
  }

  if (!visible) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="xfc-scanner-title"
      aria-describedby="xfc-scanner-desc"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4"
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[28px] border border-amber-200 bg-[#fff8eb] p-6 text-[#6c1a1f] shadow-2xl"
        style={{
          backgroundImage: "url('/images/background.webp')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="rounded-2xl bg-white/95 p-4 backdrop-blur-sm">
          <p
            id="xfc-scanner-title"
            className="text-center text-lg font-black text-[#8f111a]"
          >
            Không quét bằng app máy quét mã
          </p>
          <p
            id="xfc-scanner-desc"
            className="mt-3 text-sm font-semibold leading-relaxed"
          >
            Bạn đang mở trang trong trình duyệt của app quét — phần thưởng có thể{" "}
            <span className="font-bold text-[#d81b21]">không lưu đúng</span>.
            Vui lòng{" "}
            <span className="font-bold">thoát khỏi màn hình này</span>, mở{" "}
            <span className="font-bold">Camera</span> trên điện thoại, đưa vào{" "}
            <span className="font-bold">mã QR</span> và chạm vào thông báo để
            mở bằng trình duyệt chính (Safari / Chrome).
          </p>
          <p className="mt-3 text-xs font-medium leading-relaxed text-[#6c1a1f]/85">
            Không quét lại được ngay? Sao chép link, dán vào Safari / Chrome rồi
            lưu trang.
          </p>

          <button
            type="button"
            onClick={() => void copyLink()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#d81b21] px-4 py-4 text-sm font-bold text-white shadow-lg"
          >
            <ExternalLink size={18} />
            Sao chép link (mở trong Safari / Chrome)
          </button>

          <button
            type="button"
            onClick={escapeAfterConfirm}
            className="mt-6 w-full text-center text-[11px] font-semibold text-[#8f111a]/70 underline decoration-dotted underline-offset-4"
          >
            Tôi đã mở bằng Camera / trình duyệt đúng — ẩn thông báo
          </button>
        </div>
      </div>
    </div>
  );
}
