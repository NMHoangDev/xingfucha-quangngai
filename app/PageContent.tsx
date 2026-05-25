"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import confetti from "canvas-confetti";
import {
  CheckCircle2,
  ChevronRight,
  Gift,
  Lock,
  Phone,
  Sparkles,
  Target,
  User,
  X,
} from "lucide-react";

import OpenInSafariBanner from "@/components/OpenInSafariBanner";
import logoWebp from "@/assets/logo.webp";
import { REWARDS, type Reward } from "@/lib/rewards/rewards";
import { selectWeightedReward } from "@/lib/rewards/reward.service";
import { runWithCrossTabStorageLock } from "@/lib/spins/cross-tab-lock";

type UserInfo = { name: string; phone: string };
type ActiveTab = "spin" | "rewards";
type SpinReward = Reward & {
  voucherDelayMinutes?: number;
  voucherUsableFrom?: string | null;
  voucherExpiresAt?: string | null;
};
type WalletItem = SpinReward & {
  quantity: number;
  firstWonAt: string;
  lastWonAt: string;
  lastUsedAt?: string | null;
  voucherCodes?: string[];
  locationId?: string;
};
type WalletStore = { items: WalletItem[]; updatedAt: string };
type SavedProfile = { name: string; phone: string };
type DailyQuotaStore = {
  day: string;
  spinsUsedToday: number;
  maxSpinsToday: number;
  profileKey?: string;
};

const WALLET_KEY = "xfc-wallet-v2";
/** 3 lượt quay / ngày (theo ngày lịch trình duyệt), chỉ lưu localStorage */
const MAX_SPINS_PER_DAY = 3;
const DAILY_QUOTA_KEY = "xfc-daily-quota-v3";
const ACTIVE_TAB_KEY = "xfc-active-tab-v1";
const PROFILE_KEY = "xfc-profile-v1";
const DAILY_USAGE_KEY = "xfc-daily-usage-v2";
const CHANNEL_KEY = "xfc-spin-sync-v2";
const WALLET_COOKIE = "xfc_wallet_summary";
/** Không còn phân chi nhánh — giá trị cố định lưu kèm voucher trong ví (local). */
const DEFAULT_PLAY_LOCATION = "chung";

const rewardVisuals: Record<
  number,
  { emoji: string; accent: string; soft: string; shortLabel: string }
> = {
  0: { emoji: "🧋", accent: "#b45309", soft: "#fef3c7", shortLabel: "Topping" },
  1: {
    emoji: "🥤",
    accent: "#b91c1c",
    soft: "#fee2e2",
    shortLabel: "Trà sữa(M)",
  },
  2: {
    emoji: "🥥",
    accent: "#9a3412",
    soft: "#ffedd5",
    shortLabel: "Nước dừa(L)",
  },
  3: {
    emoji: "🍋",
    accent: "#4d7c0f",
    soft: "#ecfccb",
    shortLabel: "Trà Trái cây(L)",
  },
};

/** Ngày theo múi giờ máy khách (YYYY-MM-DD) — reset lượt quay & dùng voucher theo ngày lịch */
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function stripVietnameseTones(input: string): string {
  const normalized = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized.replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
}

/** `tenkhongdaukhoangtrang_sodienthoai` — ví dụ nguyenminhhoang_0987264135 */
function createProfileKey(name: string, phone: string) {
  const digits = phone.replace(/\D/g, "");
  const namePart = stripVietnameseTones(name.trim()).replace(/\s+/g, "");
  return `${namePart}_${digits}`;
}

function formatTime(value?: string | null) {
  if (!value) return null;
  try {
    // Dùng fixed format thay vì toLocaleString để tránh hydration mismatch
    const d = new Date(value);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  } catch {
    return value;
  }
}

function getRewardConditionNote(reward?: { id: number } | null) {
  if (!reward) return null;
  if (reward.id === 0) return "Không áp dụng cho topping 10k";
  if (reward.id === 2)
    return "Không áp dụng cho nước dừa  full topping thủ công.";
  if (reward.id === 1) return `Chỉ áp dụng cho mục "Trà sữa chí cốt"`;
  if (reward.id === 3) return `Áp dụng toàn bộ trong nhóm thanh xuân`;

  return null;
}

function getRewardCodeDescription(code?: string | null) {
  if (!code) return null;
  switch (code) {
    case "TRA-TRAI-CAY-L":
      return "Áp dụng cho toàn bộ nhóm thanh xuân";
    case "TRA-SUA-M":
      return `Không áp dụng cho trà sữa fulltopping`;
    case "TOPPING":
      return "Không áp dụng cho topping 10k";
    case "NUOCDUA-L":
      return "Không áp dụng cho nước dừa full topping thủ công";
    default:
      return code;
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function generateLocalVoucherCode(productCode: string) {
  const base = productCode.replace(/\s+/g, "-").toUpperCase();
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  return `XFC-${base}-${suffix}`;
}

function readUsedRewardCount() {
  const stored = readJson<{ day: string; count: number }>(DAILY_USAGE_KEY);
  return stored?.day === todayKey() ? Number(stored.count ?? 0) : 0;
}

function RewardIcon({
  rewardId,
  size = "md",
}: {
  rewardId: number;
  size?: "sm" | "md" | "lg";
}) {
  const visual = rewardVisuals[rewardId] ?? rewardVisuals[0];
  const classes =
    size === "sm"
      ? "h-10 w-10 text-lg"
      : size === "lg"
        ? "h-16 w-16 text-3xl"
        : "h-12 w-12 text-2xl";

  return (
    <div
      className={`flex items-center justify-center rounded-2xl border border-white/80 shadow-sm ${classes}`}
      style={{ backgroundColor: visual.soft, color: visual.accent }}
    >
      {visual.emoji}
    </div>
  );
}

function Modal({
  open,
  title,
  children,
  onClose,
  closeOnBackdrop = true,
}: {
  open: boolean;
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  closeOnBackdrop?: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeOnBackdrop ? onClose : undefined}
          />
          <motion.div
            className="relative z-10 w-full max-w-sm rounded-[28px] p-6 shadow-2xl"
            style={{
              backgroundImage: "url('/images/background.webp')",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
          >
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 rounded-full bg-gray-100 p-2 text-gray-500"
              >
                <X size={18} />
              </button>
            )}
            {title && (
              <h3 className="mb-5 text-center text-2xl font-extrabold text-[#8f111a]">
                {title}
              </h3>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default function PageContent() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("spin");
  const [userInfo, setUserInfo] = useState<UserInfo>({ name: "", phone: "" });
  const [wallet, setWallet] = useState<WalletStore>({
    items: [],
    updatedAt: "",
  });
  const [quota, setQuota] = useState<DailyQuotaStore | null>(null);
  const [showQuota, setShowQuota] = useState(false);
  const [usedRewardCount, setUsedRewardCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [duration, setDuration] = useState(5200);
  const [formError, setFormError] = useState("");
  const [resultOpen, setResultOpen] = useState(false);
  const [preSpinOpen, setPreSpinOpen] = useState(false);
  const [rewardResult, setRewardResult] = useState<SpinReward | null>(null);
  const [showUnboxAnimation, setShowUnboxAnimation] = useState(false);
  const [rulesPopupOpen, setRulesPopupOpen] = useState(false);
  const [usedVoucherOpen, setUsedVoucherOpen] = useState(false);
  const [usedVoucherInfo, setUsedVoucherInfo] = useState<WalletItem | null>(
    null,
  );
  const [useRewardLoading, setUseRewardLoading] = useState(false);
  const [localDataReady, setLocalDataReady] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const spinSectionRef = useRef<HTMLDivElement | null>(null);
  const buttonSectionRef = useRef<HTMLDivElement | null>(null);
  const phoneRegex = /^(0|84)(3|5|7|8|9)([0-9]{8})$/;

  useEffect(() => {
    setWallet(
      readJson<WalletStore>(WALLET_KEY) ?? { items: [], updatedAt: "" },
    );
    const t = todayKey();
    const raw = readJson<DailyQuotaStore>(DAILY_QUOTA_KEY);
    let nextQuota: DailyQuotaStore;
    if (!raw || raw.day !== t) {
      nextQuota = {
        day: t,
        spinsUsedToday: 0,
        maxSpinsToday: MAX_SPINS_PER_DAY,
      };
      window.localStorage.setItem(
        DAILY_QUOTA_KEY,
        JSON.stringify(nextQuota),
      );
    } else {
      nextQuota = {
        day: raw.day,
        spinsUsedToday: Math.min(
          Math.max(0, Number(raw.spinsUsedToday ?? 0)),
          MAX_SPINS_PER_DAY,
        ),
        maxSpinsToday: MAX_SPINS_PER_DAY,
        ...(raw.profileKey ? { profileKey: raw.profileKey } : {}),
      };
      window.localStorage.setItem(
        DAILY_QUOTA_KEY,
        JSON.stringify(nextQuota),
      );
    }
    setQuota(nextQuota);
    setUsedRewardCount(readUsedRewardCount());
    const savedProfile = readJson<SavedProfile>(PROFILE_KEY);
    if (savedProfile) setUserInfo(savedProfile);
    const savedTab = window.sessionStorage.getItem(ACTIVE_TAB_KEY);
    if (savedTab === "spin" || savedTab === "rewards") setActiveTab(savedTab);
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(CHANNEL_KEY);
      channelRef.current = channel;
      channel.onmessage = (event) => {
        if (event.data?.type === "wallet")
          setWallet(event.data.payload as WalletStore);
        if (event.data?.type === "quota")
          setQuota(event.data.payload as DailyQuotaStore | null);
        if (event.data?.type === "used-count")
          setUsedRewardCount(Number(event.data.payload ?? 0));
      };
    }
    setLocalDataReady(true);
    return () => {
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, []);

  /** Tab khác ghi localStorage → đồng bộ state (bổ sung cho BroadcastChannel). */
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.storageArea !== window.localStorage) return;
      if (e.key === WALLET_KEY && e.newValue) {
        try {
          setWallet(JSON.parse(e.newValue) as WalletStore);
        } catch {
          /* empty */
        }
      }
      if (e.key === DAILY_QUOTA_KEY) {
        if (!e.newValue) setQuota(null);
        else {
          try {
            setQuota(JSON.parse(e.newValue) as DailyQuotaStore);
          } catch {
            /* empty */
          }
        }
      }
      if (e.key === DAILY_USAGE_KEY && e.newValue) {
        try {
          const o = JSON.parse(e.newValue) as { day: string; count: number };
          if (o.day === todayKey())
            setUsedRewardCount(Math.max(0, Number(o.count ?? 0)));
        } catch {
          /* empty */
        }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  // Thêm useEffect này sau các useEffect khác
  useEffect(() => {
    const promise = new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          resolve();
        });
      });
    });
    promise.then(() => setShowQuota(true));
  }, []);
  useEffect(() => {
    window.sessionStorage.setItem(ACTIVE_TAB_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    const hasShownRulesPopup = window.sessionStorage.getItem(
      "xfc-rules-shown-this-session",
    );
    if (!hasShownRulesPopup) {
      setRulesPopupOpen(true);
      window.sessionStorage.setItem("xfc-rules-shown-this-session", "true");
    }
  }, []);

  // Auto-scroll to button section on page load
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (buttonSectionRef.current) {
        buttonSectionRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, []);

  // Khi spin kết thúc → bắt đầu animation unbox
  useEffect(() => {
    if (!isSpinning) return;
    const timer = window.setTimeout(() => {
      setIsSpinning(false);
      setShowUnboxAnimation(true);
      confetti({
        particleCount: 140,
        spread: 72,
        origin: { y: 0.58 },
        colors: ["#d81b21", "#ffd700", "#fff8dc"],
      });
    }, duration + 60);
    return () => window.clearTimeout(timer);
  }, [duration, isSpinning]);

  // Animation unbox: 1s shake + 4s opening = 5s, rồi mở popup voucher ngay lập tức
  useEffect(() => {
    if (!showUnboxAnimation) return;
    const timer = window.setTimeout(() => {
      setResultOpen(true);
    }, 1500); // Popup mở ngay khi hộp quà mở xong
    return () => window.clearTimeout(timer);
  }, [showUnboxAnimation]);

  const groupedWallet = useMemo(
    () =>
      [...wallet.items].sort((a, b) =>
        b.quantity !== a.quantity
          ? b.quantity - a.quantity
          : new Date(b.lastWonAt).getTime() - new Date(a.lastWonAt).getTime(),
      ),
    [wallet.items],
  );

  /** Giới hạn lượt quay theo localStorage + ngày lịch */
  const hasReachedSpinLimit =
    quota?.day === todayKey() &&
    quota.spinsUsedToday >= quota.maxSpinsToday;
  const localSpinBlocked = hasReachedSpinLimit;

  const persistWallet = (nextWallet: WalletStore) => {
    setWallet(nextWallet);
    window.localStorage.setItem(WALLET_KEY, JSON.stringify(nextWallet));
    document.cookie = `${WALLET_COOKIE}=${encodeURIComponent(nextWallet.items.map((item) => `${item.id}:${item.quantity}`).join(","))}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
    channelRef.current?.postMessage({ type: "wallet", payload: nextWallet });
  };

  const persistQuota = (nextQuota: DailyQuotaStore | null) => {
    setQuota(nextQuota);
    if (nextQuota)
      window.localStorage.setItem(DAILY_QUOTA_KEY, JSON.stringify(nextQuota));
    else window.localStorage.removeItem(DAILY_QUOTA_KEY);
    channelRef.current?.postMessage({ type: "quota", payload: nextQuota });
  };

  const persistProfile = (profile: SavedProfile) => {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  };

  const persistUsedRewardCount = (count: number) => {
    setUsedRewardCount(count);
    window.localStorage.setItem(
      DAILY_USAGE_KEY,
      JSON.stringify({ day: todayKey(), count }),
    );
    channelRef.current?.postMessage({ type: "used-count", payload: count });
  };

  const addRewardToWallet = (
    reward: SpinReward,
    receivedAt: string,
    spinMeta?: { voucherCode?: string; locationId?: string },
  ) => {
    const current = readJson<WalletStore>(WALLET_KEY) ?? {
      items: [],
      updatedAt: "",
    };
    const existing = current.items.find((item) => item.id === reward.id);
    const items = existing
      ? current.items.map((item) =>
          item.id === reward.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                lastWonAt: receivedAt,
                voucherUsableFrom:
                  reward.voucherUsableFrom ?? item.voucherUsableFrom ?? null,
                voucherExpiresAt:
                  reward.voucherExpiresAt ?? item.voucherExpiresAt ?? null,
                voucherCodes: spinMeta?.voucherCode
                  ? [...(item.voucherCodes ?? []), spinMeta.voucherCode]
                  : item.voucherCodes,
                locationId: spinMeta?.locationId ?? item.locationId,
              }
            : item,
        )
      : [
          ...current.items,
          {
            ...reward,
            quantity: 1,
            firstWonAt: receivedAt,
            lastWonAt: receivedAt,
            voucherCodes: spinMeta?.voucherCode ? [spinMeta.voucherCode] : [],
            locationId: spinMeta?.locationId,
          },
        ];
    persistWallet({ items, updatedAt: receivedAt });
  };

  const readProfileFromState = () => ({
    name: userInfo.name.trim(),
    phone: userInfo.phone.trim(),
  });

  const isProfileValid = (profile: { name: string; phone: string }) =>
    Boolean(profile.name && profile.phone && phoneRegex.test(profile.phone));

  async function submitSpin(name: string, phone: string) {
    setFormError("");
    setLoading(true);
    try {
      type SpinOk = {
        duration: number;
        target: number;
        spinReward: SpinReward;
      };
      const outcome = await runWithCrossTabStorageLock((): SpinOk | "limit" => {
        const t = todayKey();
        const rawQ = readJson<DailyQuotaStore>(DAILY_QUOTA_KEY);
        const q: DailyQuotaStore =
          rawQ && rawQ.day === t
            ? {
                day: t,
                spinsUsedToday: Math.min(
                  Math.max(0, Number(rawQ.spinsUsedToday ?? 0)),
                  MAX_SPINS_PER_DAY,
                ),
                maxSpinsToday: MAX_SPINS_PER_DAY,
                ...(rawQ.profileKey ? { profileKey: rawQ.profileKey } : {}),
              }
            : {
                day: t,
                spinsUsedToday: 0,
                maxSpinsToday: MAX_SPINS_PER_DAY,
              };
        if (q.spinsUsedToday >= q.maxSpinsToday) {
          persistQuota(q);
          return "limit";
        }
        const { reward, index } = selectWeightedReward();
        const now = new Date();
        const expiresAt = new Date(now.getTime());
        expiresAt.setMonth(expiresAt.getMonth() + 1);
        const usableFromIso = now.toISOString();
        const expiresIso = expiresAt.toISOString();
        const voucherCode = generateLocalVoucherCode(
          reward.code ?? String(reward.id),
        );
        const spinReward: SpinReward = {
          ...reward,
          voucherDelayMinutes: 0,
          voucherUsableFrom: usableFromIso,
          voucherExpiresAt: expiresIso,
        };
        const angle = 360 / REWARDS.length;
        const extraSpins = 6 + Math.floor(Math.random() * 3);
        const offset = (Math.random() - 0.5) * (angle * 0.42);
        const target =
          extraSpins * 360 + (360 - (index * angle + angle / 2)) + offset;
        const receivedAt = now.toISOString();
        const duration = 3000 + Math.floor(Math.random() * 800);
        persistProfile({ name, phone });
        addRewardToWallet(spinReward, receivedAt, {
          voucherCode,
          locationId: DEFAULT_PLAY_LOCATION,
        });
        persistQuota({
          day: t,
          spinsUsedToday: q.spinsUsedToday + 1,
          maxSpinsToday: MAX_SPINS_PER_DAY,
          profileKey: createProfileKey(name, phone),
        });
        return { duration, target, spinReward };
      });

      if (outcome === "limit") {
        setFormError(
          `Đã dùng hết ${MAX_SPINS_PER_DAY} lượt quay hôm nay cho thiết bị này.`,
        );
        return;
      }
      setDuration(outcome.duration);
      setRotation((prev) => prev + outcome.target - (prev % 360));
      setRewardResult(outcome.spinReward);
      setPreSpinOpen(false);
      setIsSpinning(true);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Có lỗi xảy ra khi quay vòng quay.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSpinSubmit(event: React.FormEvent) {
    event.preventDefault();
    const profile = readProfileFromState();
    if (!profile.name || !profile.phone)
      return setFormError("Vui lòng nhập đầy đủ họ tên và số điện thoại.");
    if (!phoneRegex.test(profile.phone))
      return setFormError("Vui lòng nhập số điện thoại Việt Nam hợp lệ.");
    await submitSpin(profile.name, profile.phone);
  }

  async function handleSpinStart() {
    if (isSpinning || localSpinBlocked) return;
    const profile = readProfileFromState();
    if (isProfileValid(profile)) {
      await submitSpin(profile.name, profile.phone);
      return;
    }
    setPreSpinOpen(true);
  }

  async function handleUseReward(rewardId: number) {
    const savedProfile = readJson<SavedProfile>(PROFILE_KEY);
    if (!savedProfile?.phone)
      return setFormError(
        "Chưa tìm thấy thông tin người chơi để sử dụng voucher.",
      );
    setUseRewardLoading(true);
    try {
      const consumedMeta = await runWithCrossTabStorageLock(() => {
        const usedToday = readUsedRewardCount();
        if (usedToday >= 3) {
          throw new Error(
            "Bạn đã dùng đủ 3 voucher trong hôm nay, chưa thể dùng thêm.",
          );
        }
        const current = readJson<WalletStore>(WALLET_KEY) ?? {
          items: [],
          updatedAt: "",
        };
        const consumedReward = current.items.find(
          (item) => item.id === rewardId,
        );
        const voucherCode = consumedReward?.voucherCodes?.[0];
        if (!voucherCode) {
          throw new Error("Không tìm thấy mã voucher để sử dụng.");
        }

        const usedAt = new Date().toISOString();
        const nextItems = current.items
          .map((item) =>
            item.id === rewardId
              ? {
                  ...item,
                  quantity: item.quantity - 1,
                  lastUsedAt: usedAt,
                  voucherCodes: (item.voucherCodes ?? []).slice(1),
                }
              : item,
          )
          .filter((item) => item.quantity > 0);
        persistWallet({
          items: nextItems,
          updatedAt: new Date().toISOString(),
        });
        persistUsedRewardCount(usedToday + 1);
        return { consumedReward: consumedReward ?? null };
      });

      setFormError("");
      setUsedVoucherInfo(consumedMeta.consumedReward);
      setUsedVoucherOpen(true);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Không thể sử dụng voucher lúc này.",
      );
    } finally {
      setUseRewardLoading(false);
    }
  }

  function handleCloseResult() {
    setResultOpen(false);
    setShowUnboxAnimation(false);
    setActiveTab("rewards");
  }

  if (!localDataReady) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#f7ead1] text-[#571017]">
        <Modal open={true} title="Đang tải" closeOnBackdrop={false}>
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#d81b21]/10 text-[#d81b21]">
              <Lock size={24} />
            </div>
            <p className="text-sm font-semibold text-[#6c1a1f]">
              Đang đọc dữ liệu đã lưu trên máy của bạn…
            </p>
          </div>
        </Modal>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7ead1] text-[#571017]">
      <div className="absolute inset-0">
        <Image
          src="/images/background.webp"
          alt="Background XingFuCha"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,248,220,0.5)_0%,rgba(253,245,230,0.68)_36%,rgba(249,228,191,0.82)_100%)]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[440px] flex-col px-4 pb-8 pt-4">
        <OpenInSafariBanner />
        <header
          className="rounded-[30px] border border-white/70 p-4 shadow-[0_20px_40px_rgba(120,24,30,0.08)] backdrop-blur"
          style={{
            backgroundImage: "url('/images/background.webp')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative h-14 w-14 overflow-hidden rounded-full border-2 border-white bg-transparent ">
                <Image
                  src={logoWebp}
                  alt="Logo XingFuCha"
                  fill
                  sizes="64px"
                  className="object-contain"
                />
              </div>
              <div className="flex flex-col items-start align-left">
                <p className="mt-1 text-xs font-semibold text-[#6c1a1f]">
                  Vòng Xing May Mắn
                </p>
                <div className="mt-0.5 h-5 w-20 flex items-center -ml-1">
                  <Image
                    src="/images/logo_text.webp"
                    alt="XingFuCha"
                    width={80}
                    height={20}
                    className="object-contain"
                  />
                </div>
              </div>
            </div>
            <div className="rounded-full bg-[#d81b21]/10 px-3 py-1 text-[11px] font-bold text-[#b71721]">
              Kho quà nhà Xing
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 rounded-2xl bg-white p-3 text-sm text-[#6c1a1f]">
            <p>
              <span className="font-bold">Khách hàng:</span>{" "}
              {userInfo.name.trim() || "Chưa cập nhật"}
            </p>
            <p>
              <span className="font-bold">SĐT:</span>{" "}
              {userInfo.phone.trim() || "Chưa cập nhật"}
            </p>
            
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-white p-1.5">
            {(["spin", "rewards"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-2xl px-4 py-3 text-sm font-extrabold transition ${activeTab === tab ? "bg-[#d81b21] text-white shadow-[0_10px_20px_rgba(216,27,33,0.22)]" : "text-[#8f111a]"}`}
              >
                {tab === "spin" ? "Vòng Xing May Mắn" : "Phần thưởng của bạn"}
              </button>
            ))}
          </div>
        </header>

        {activeTab === "spin" ? (
          <>
            <section
              ref={spinSectionRef}
              className="relative mt-6 rounded-[34px] px-3 sm:px-4 pb-6 pt-7 shadow-[0_24px_48px_rgba(120,24,30,0.12)]"
              style={{
                backgroundImage: "url('/images/nenchosectionvongquay.webp')",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="relative mx-auto h-[112px] max-w-[320px]">
                <Image
                  src="/images/text.webp"
                  alt="Vòng Xing May Mắn"
                  width={320}
                  height={112}
                  priority
                  className="object-contain"
                />

                <div className="pointer-events-none absolute -top-0 -left-6 h-[50px] w-[50px] sm:h-[48px] sm:w-[48px]">
                  <Image
                    src="/images/vuongmien.webp"
                    alt="Vương miện trang trí"
                    fill
                    sizes="50px"
                    className="object-contain rotate-[0deg]"
                  />
                </div>

                <div className="pointer-events-none absolute left-[-20px] top-[50px] h-[100px] w-[100px] sm:h-[30px] sm:w-[30px]">
                  <Image
                    src="/images/blinkicon.webp"
                    alt="Hiệu ứng lấp lánh"
                    fill
                    sizes="100px"
                    className="object-contain"
                  />
                </div>

                <div className="pointer-events-none absolute -right-8 top-8 h-[100px] w-[100px] sm:h-[72px] sm:w-[72px]">
                  <Image
                    src="/images/hopquafull.webp"
                    alt="Hộp quà trang trí"
                    fill
                    sizes="100px"
                    className="object-contain rotate-[20deg]"
                  />
                </div>
                <div className="pointer-events-none absolute right-4 -top-10 h-[70px] w-[70px] sm:h-[72px] sm:w-[72px]">
                  <Image
                    src="/images/blink2.webp"
                    alt="Hộp quà trang trí"
                    fill
                    sizes="70px"
                    className="object-contain rotate-[20deg]"
                  />
                </div>
              </div>

              {/* Wrapper relative để các icon absolute tràn ra ngoài */}
              <div className="relative mx-auto mt-2 w-full max-w-[420px] sm:max-w-[460px] h-[420px] sm:h-[460px]">
                <Image
                  src="/images/khungvongquay.webp"
                  alt="Khung vòng quay"
                  fill
                  sizes="(max-width: 640px) 420px, 460px"
                  className="object-contain"
                />
                <motion.div
                  animate={{ rotate: rotation }}
                  transition={{
                    duration: duration / 1000,
                    ease: [0.12, 0, 0.2, 1],
                  }}
                  className="absolute left-1/2 top-1/2 h-[290px] w-[290px] sm:h-[310px] sm:w-[310px] -translate-x-1/2 -translate-y-[64%] rounded-full"
                >
                  <Image
                    src="/images/vongtron.webp"
                    alt="Mặt vòng quay"
                    fill
                    sizes="(max-width: 640px) 290px, 310px"
                    className="object-contain"
                  />
                </motion.div>

                {/* Mũi tên */}
                <div className="pointer-events-none absolute left-1/2 top-1/2 mt-2 z-20 h-[80px] w-[80px] -translate-x-1/2 -translate-y-[120%]">
                  <Image
                    src="/images/muiten.webp"
                    alt="Mũi tên vòng quay"
                    fill
                    sizes="180px"
                    className="object-contain drop-shadow-[0_8px_16px_rgba(120,24,30,0.22)]"
                  />
                </div>

                {/* ── ICON PHẢI: Gấu/Hổ ── tràn phải, tụt xuống dưới */}
                <div
                  className="pointer-events-none absolute h-[150px] w-[150px] sm:h-[180px] sm:w-[180px]"
                  style={{
                    bottom: "-70px",
                    right: "-40px",
                    zIndex: 30,
                  }}
                >
                  <Image
                    src="/images/iconnguongmo.webp"
                    alt="Gấu dễ thương nhìn lên vòng quay"
                    fill
                    sizes="100px"
                    className="object-contain drop-shadow-[0_8px_14px_rgba(120,24,30,0.2)]"
                  />
                </div>

                {/* ── ICON TRÁI: Hộp quà ── tràn trái, tụt xuống */}
                <div
                  className="pointer-events-none absolute h-[130px] w-[130px] sm:h-[155px] sm:w-[155px]"
                  style={{
                    bottom: "-80px",
                    left: "-40px",
                    zIndex: 30,
                    transform: "rotate(10deg)",
                  }}
                >
                  <Image
                    src="/images/HopQua.webp"
                    alt="Hộp quà"
                    fill
                    sizes="155px"
                    className="object-contain drop-shadow-[0_8px_14px_rgba(120,24,30,0.2)]"
                  />
                </div>

                {/* ── ICON TRÁI: Túi 3 gáy ── tràn trái nhất */}
                <div
                  className="pointer-events-none absolute h-[100px] w-[100px]"
                  style={{
                    bottom: "-10px",
                    left: "-70px",
                    zIndex: 29,
                    transform: "rotate(-15deg)",
                  }}
                >
                  <Image
                    src="/images/tui3gang.webp"
                    alt="Túi 3 gáy"
                    fill
                    sizes="100px"
                    className="object-contain drop-shadow-[0_2px_4px_rgba(120,24,30,0.15)]"
                  />
                </div>

                {/* ── ICON TRÁI: Quạt ── giữa trái */}
                <div
                  className="pointer-events-none absolute h-[90px] w-[90px]"
                  style={{
                    bottom: "-20px",
                    left: "10px",
                    zIndex: 29,
                    transform: "rotate(20deg)",
                  }}
                >
                  <Image
                    src="/images/quat.webp"
                    alt="Quạt"
                    fill
                    sizes="90px"
                    className="object-contain drop-shadow-[0_2px_4px_rgba(120,24,30,0.15)]"
                  />
                </div>

                {/* ── ICON TRÁI: Bình nước ── gần giữa hơn */}
                <div
                  className="pointer-events-none absolute h-[90px] w-[90px]"
                  style={{
                    bottom: "-15px",
                    left: "-25px",
                    zIndex: 29,
                    transform: "rotate(4deg)",
                  }}
                >
                  <Image
                    src="/images/binhnuoc.webp"
                    alt="Bình nước"
                    fill
                    sizes="90px"
                    className="object-contain drop-shadow-[0_2px_4px_rgba(120,24,30,0.15)]"
                  />
                </div>
              </div>
            </section>

            <section
              className="mt-5 flex flex-col gap-4"
              ref={buttonSectionRef}
            >
              {/* Button luôn render trước */}
              <button
                type="button"
                onClick={handleSpinStart}
                disabled={isSpinning || localSpinBlocked}
                className="w-full mt-6 rounded-[24px] border-2 border-white bg-[#d81b21] px-8 py-4 text-2xl font-black text-[#f2f6dd] shadow-[0_8px_0_rgb(139,25,32)] transition active:translate-y-1 active:shadow-none disabled:opacity-70"
              >
                {isSpinning
                  ? "Đang quay..."
                  : hasReachedSpinLimit
                    ? "Đã hết lượt quay hôm nay"
                    : "Quay ngay"}
              </button>

              {formError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-700">
                  {formError}
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="mt-6 rounded-[34px] bg-[linear-gradient(180deg,#fff7e7_0%,#fff0d0_100%)] p-5 shadow-[0_24px_48px_rgba(120,24,30,0.12)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d81b21]/10 text-[#d81b21]">
                <Gift size={22} />
              </div>
              <div>
                <Modal
                  open={rulesPopupOpen}
                  title="Thể Lệ Vòng Quay"
                  closeOnBackdrop={false}
                >
                  <div className="space-y-3 text-sm font-semibold leading-6 text-[#6c1a1f] bg-white p-2 rounded-xl">
                    <p>
                      Voucher có thể dùng ngay sau khi trúng, hết hạn sau 1
                      tháng và mỗi ngày dùng tối đa 3 voucher.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRulesPopupOpen(false)}
                    className="mt-5 w-full rounded-2xl bg-[#d81b21] px-4 py-3 text-sm font-bold text-white"
                  >
                    Đã hiểu
                  </button>
                </Modal>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#b71721]/75">
                  Kho quà nhà Xing
                </p>
                <h2 className="text-2xl font-black text-[#8f111a] ">
                  Phần thưởng của bạn
                </h2>
              </div>
            </div>

            {groupedWallet.length ? (
              <div className="mt-5 grid gap-4">
                {groupedWallet.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[24px] border border-[#f3cf8c] bg-white/90 p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative h-26 w-26 flex-shrink-0">
                        <Image
                          src="/images/logo.webp"
                          alt="Logo XingFuCha"
                          fill
                          sizes="64px"
                          className="object-contain"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-lg font-black leading-tight text-[#d81b21]">
                          {item.label}
                        </p>
                        <p className="mt-1 text-sm font-medium text-[#6c1a1f]">
                          Số lượng hiện có:{" "}
                          <span className="rounded-full bg-[#d81b21]/10 px-3 py-1 font-extrabold text-[#b71721]">
                            {item.quantity}
                          </span>
                        </p>
                      </div>
                    </div>
                    {item.code && (
                      <div
                        className="mt-3  inline-flex rounded-xl border border-[#f3cf8c] bg-[#fff8dc] px-3 py-2 font-mono text-sm font-bold tracking-tighter text-[#8f111a] "
                        style={{ wordSpacing: "-2px" }}
                      >
                        {getRewardCodeDescription(item.code)}
                      </div>
                    )}
                    <div className="mt-3 space-y-1.5 text-sm leading-6 text-[#6c1a1f]">
                      {item.type === "voucher" && (
                        <p>
                          Hạn sử dụng:{" "}
                          <span className="font-bold">
                            {formatTime(item.voucherUsableFrom) ??
                              `Sau ${item.voucherDelayMinutes ?? 0} phút`}
                          </span>{" "}
                          -{" "}
                          <span className="font-bold">
                            {formatTime(item.voucherExpiresAt) ?? "-"}
                          </span>
                        </p>
                      )}
                      {item.type === "voucher" && (
                        <p className="rounded-2xl bg-[#fff8dc] px-3 py-2 text-xs font-semibold leading-5 text-[#8f111a]">
                          Điều kiện: Voucher được áp dụng cho hóa đơn 40K
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void handleUseReward(item.id);
                      }}
                      disabled={
                        usedRewardCount >= 3 ||
                        item.quantity <= 0 ||
                        useRewardLoading
                      }
                      className="mt-3 w-full rounded-2xl bg-[#d81b21] px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {useRewardLoading
                        ? "Đang xử lý..."
                        : usedRewardCount >= 3
                          ? "Hôm nay đã dùng đủ 3 voucher"
                          : "Sử dụng voucher này"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-[28px] border border-dashed border-[#d81b21]/25 bg-white/75 p-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#d81b21]/10 text-[#d81b21]">
                  <Sparkles size={24} />
                </div>
                <p className="mt-4 text-lg font-extrabold text-[#8f111a]">
                  Bạn chưa có phần thưởng nào
                </p>
                <p className="mt-2 text-sm leading-6 text-[#6c1a1f]">
                  Hãy quay ở tab “Vòng Xing May Mắn”, quà trúng sẽ tự cộng dồn
                  vào kho quà của bạn.
                </p>
              </div>
            )}
          </section>
        )}
      </div>

      {/* ─── UNBOX ANIMATION OVERLAY ─── */}
      {/* Hiện ngay sau khi vòng quay dừng, z-40 (dưới modal z-50) */}
      <AnimatePresence>
        {showUnboxAnimation && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.72)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            {/* Container hộp quà */}
            <div className="relative h-[900px] w-[900px]">
              {/* hopquafull: lắc lắc 1s mạnh hơn, rồi ẩn dần */}
              <motion.div
                className="absolute h-[680px] w-[680px]"
                style={{
                  left: "50%",
                  top: "50%",
                  x: "-50%",
                  y: "-50%",
                }}
                initial={{ opacity: 1, scale: 1, rotate: 0 }}
                animate={{
                  rotate: [0, -6, 6, -6, 6, -4, 4, -4, 4, 0],
                  opacity: [1, 1, 1, 0],
                  scale: [1, 1, 1, 0.85],
                }}
                transition={{
                  rotate: { duration: 1, delay: 0, ease: "easeInOut" },
                  opacity: { duration: 0.8, delay: 1, ease: "easeInOut" },
                  scale: { duration: 0.8, delay: 1, ease: "easeInOut" },
                }}
              >
                <Image
                  src="/images/hopquafull.webp"
                  alt="Hộp quà đóng"
                  fill
                  sizes="680px"
                  className="object-contain"
                />
              </motion.div>

              {/* hopquakhongnap: bay xuống trái 4s */}
              <motion.div
                className="absolute h-[560px] w-[560px]"
                style={{
                  left: "50%",
                  top: "50%",
                  x: "-50%",
                  y: "-50%",
                }}
                initial={{ opacity: 0, x: "-50%", y: "-50%" }}
                animate={{
                  opacity: 1,
                  x: "calc(-50% - 280px)",
                  y: "calc(-50% + 280px)",
                  rotate: -15,
                }}
                transition={{
                  duration: 3,
                  delay: 1,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
              >
                <Image
                  src="/images/hopquakhongnap.webp"
                  alt="Hộp quà không nắp"
                  fill
                  sizes="560px"
                  className="object-contain"
                />
              </motion.div>

              {/* napqua: bay lên phải 4s */}
              <motion.div
                className="absolute h-[500px] w-[500px]"
                style={{
                  left: "50%",
                  top: "50%",
                  x: "-50%",
                  y: "-50%",
                }}
                initial={{ opacity: 0, x: "-50%", y: "-50%" }}
                animate={{
                  opacity: 1,
                  x: "calc(-50% + 360px)",
                  y: "calc(-50% - 360px)",
                  rotate: 28,
                }}
                transition={{
                  duration: 3,
                  delay: 1,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
              >
                <Image
                  src="/images/napqua.webp"
                  alt="Nắp quà"
                  fill
                  sizes="500px"
                  className="object-contain"
                />
              </motion.div>

              {/* Emoji 🎉 xuất hiện sau khi hộp đã mở xong */}
              <motion.div
                className="absolute left-1/2 top-8 -translate-x-1/2 text-7xl"
                initial={{ opacity: 0, y: 30, scale: 0.4 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  duration: 0.5,
                  delay: 5.3,
                  ease: [0.34, 1.56, 0.64, 1],
                }}
              >
                🎉
              </motion.div>

              {/* Text xuất hiện cùng lúc với emoji */}
              <motion.p
                className="absolute bottom-16 left-1/2 -translate-x-1/2 whitespace-nowrap text-2xl font-black text-white"
                style={{ textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 5.4 }}
              >
                Chúc mừng bạn đã trúng thưởng! 🎊
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── MODAL THÔNG TIN NGƯỜI CHƠI ─── */}
      <Modal
        open={preSpinOpen}
        title="Thông tin người chơi"
        onClose={() => !loading && setPreSpinOpen(false)}
      >
        <form onSubmit={handleSpinSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="ml-1 text-sm font-bold text-gray-700">
              Họ và tên
            </label>
            <div className="relative">
              <User
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                type="text"
                required
                placeholder="Nguyễn Văn A"
                className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50 py-3 pl-12 pr-4 outline-none transition focus:border-[#d81b21]"
                value={userInfo.name}
                onChange={(e) =>
                  setUserInfo((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="ml-1 text-sm font-bold text-gray-700">
              Số điện thoại
            </label>
            <div className="relative">
              <Phone
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                type="tel"
                required
                placeholder="0901234567"
                className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50 py-3 pl-12 pr-4 outline-none transition focus:border-[#d81b21]"
                value={userInfo.phone}
                onChange={(e) =>
                  setUserInfo((prev) => ({ ...prev, phone: e.target.value }))
                }
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#d81b21] py-4 font-bold text-white shadow-lg disabled:opacity-60"
          >
            {loading ? "Đang xử lý..." : "Bắt đầu quay"}
            {!loading && <ChevronRight size={18} />}
          </button>
        </form>
      </Modal>

      {/* ─── MODAL KẾT QUẢ VOUCHER ─── */}
      {/* Chỉ hiện sau khi animation unbox kết thúc (4000ms) */}
      <Modal open={resultOpen} onClose={handleCloseResult}>
        <motion.div
          className="text-center"
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <motion.div
            className="mx-auto -mb-8 flex justify-center"
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            {rewardResult ? (
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 0.6, repeat: 3, ease: "easeInOut" }}
              >
                <div className="relative h-40 w-40 -mt-12">
                  <Image
                    src="/images/logo.webp"
                    alt="Logo XingFuCha"
                    fill
                    sizes="120px"
                    className="object-contain"
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#fff8dc] text-3xl"
                animate={{ scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] }}
                transition={{ duration: 0.6, repeat: 3, ease: "easeInOut" }}
              >
                🎉
              </motion.div>
            )}
          </motion.div>
          <div className="bg-white rounded-xl p-2 mb-6">
            <motion.h2
              className="text-3xl font-black text-[#8f111a]"
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.4 }}
            >
              Chúc mừng!
            </motion.h2>
            <motion.p
              className="mt-2 text-sm font-medium text-gray-600"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.3 }}
            >
              Quà vừa trúng đã được cộng dồn vào kho quà của bạn.
            </motion.p>
          </div>
          <motion.div
            className="mt-6 rounded-[28px] border-2 border-dashed border-[#f3cf8c] bg-[#fff8dc] p-6"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <p className="text-2xl font-black tracking-tight text-[#d81b21]">
              {rewardResult?.label}
            </p>

            {rewardResult?.type === "voucher" && (
              <div className="mt-2 space-y-2 text-xs font-medium leading-6 text-gray-600 text-left ml-2">
                <p>
                  Voucher dùng từ{" "}
                  {formatTime(rewardResult.voucherUsableFrom) ??
                    "ngay sau khi quay"}
                  .
                </p>
                <p className="-mt-2">
                  Voucher hết hạn vào{" "}
                  {formatTime(rewardResult.voucherExpiresAt) ?? "-"}.
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      </Modal>

      <Modal
        open={usedVoucherOpen}
        title="Đã sử dụng voucher"
        closeOnBackdrop={false}
      >
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 ring-4 ring-emerald-50">
            <CheckCircle2 size={34} className="text-emerald-600" />
          </div>

          {usedVoucherInfo && (
            <div className="rounded-2xl border border-[#f3cf8c] bg-[#fff8dc] p-4">
              <div className="-mb-4 -mt-8 flex justify-center">
                <div className="relative h-32 w-32">
                  <Image
                    src="/images/logo.webp"
                    alt="Logo XingFuCha"
                    fill
                    sizes="150px"
                    className="object-contain"
                  />
                </div>
              </div>
              <p className="text-lg font-black text-[#d81b21]">
                {usedVoucherInfo.label}
              </p>

              <div className="mt-3 space-y-2">
                {usedVoucherInfo.code && (
                  <div className="inline-flex rounded-xl border border-[#f3cf8c] bg-white px-3 py-2 font-mono text-xs font-bold tracking-wider text-[#8f111a]">
                    {getRewardCodeDescription(usedVoucherInfo.code)}
                  </div>
                )}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setUsedVoucherOpen(false);
              setUsedVoucherInfo(null);
            }}
            className="w-full rounded-2xl bg-[#d81b21] px-4 py-3 text-sm font-bold text-white"
          >
            Đóng
          </button>
        </div>
      </Modal>
    </main>
  );
}
