/**
 * Auto-reset vouchers on app load if deployment version changed.
 * Runs automatically on client side, no user action needed.
 *
 * Spin deadline:  28/06/2026 23:59:59 VN (16:59:59Z).
 * Voucher expiry: 12/07/2026 23:59:59 VN (16:59:59Z).
 * Voucher usable: ngay sau khi quay (voucherUsableFrom = spin time).
 */

type WalletItem = {
  type: string;
  voucherExpiresAt?: string;
  voucherUsableFrom?: string;
  firstWonAt?: string;
  [key: string]: any;
};

type Wallet = {
  items: WalletItem[];
  updatedAt: string;
};

const APP_VERSION_KEY = "xfc-app-version";
const WALLET_KEY = "xfc-wallet-v2";
/** Bump version để force reset toàn bộ voucher cũ về hạn mới. */
const DEPLOYMENT_VERSION =
  process.env.NEXT_PUBLIC_DEPLOYMENT_VERSION || "2026-06-20-v1";

/** Hạn cuối dùng voucher (cố định, áp dụng cho mọi voucher bất kể quay ngày nào). */
const VOUCHER_EXPIRES_AT = new Date(
  Date.UTC(2026, 6, 12, 16, 59, 59, 999),
).toISOString();

export function initializeAutoReset() {
  if (typeof window === "undefined") return;

  const currentVersion = localStorage.getItem(APP_VERSION_KEY);

  // Nếu version thay đổi (hoặc lần đầu) → reset toàn bộ voucher
  if (currentVersion !== DEPLOYMENT_VERSION) {
    console.log(
      `🔄 Version update detected: ${currentVersion} → ${DEPLOYMENT_VERSION}`,
    );
    resetVouchersInLocalStorage();
    localStorage.setItem(APP_VERSION_KEY, DEPLOYMENT_VERSION);
  }
}

function resetVouchersInLocalStorage() {
  const walletData = localStorage.getItem(WALLET_KEY);

  if (!walletData) {
    console.log("ℹ️  No wallet data to reset");
    return;
  }

  try {
    const wallet: Wallet = JSON.parse(walletData);

    let resetCount = 0;

    wallet.items = (wallet.items || []).map((item: WalletItem) => {
      if (item.type === "voucher") {
        // Reset hạn dùng voucher về 12/07/2026, giữ nguyên usableFrom nếu đã có.
        item.voucherExpiresAt = VOUCHER_EXPIRES_AT;
        // Đảm bảo usableFrom tồn tại (tránh trường hợp null làm UI hiển thị "Sau 0 phút")
        if (!item.voucherUsableFrom) {
          item.voucherUsableFrom = new Date().toISOString();
        }
        if (!item.firstWonAt) {
          item.firstWonAt = item.voucherUsableFrom;
        }
        resetCount++;
      }
      return item;
    });

    wallet.updatedAt = new Date().toISOString();
    localStorage.setItem(WALLET_KEY, JSON.stringify(wallet));

    console.log(
      `✅ Auto-reset ${resetCount} vouchers → hết hạn 12/07/2026 (spin deadline 28/06/2026)`,
    );
  } catch (error) {
    console.error("❌ Auto-reset error:", error);
  }
}