const GAME_LOCK_NAME = "xfc-game-storage";
const FALLBACK_LOCK_KEY = "xfc-game-ls-lock-v1";
const FALLBACK_TTL_MS = 12_000;
const FALLBACK_WAIT_MS = 5_000;

function randomHolderId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Tuần tự hóa đọc/ghi localStorage giữa các tab (Web Locks API nếu có;
 * không thì mutex localStorage + chờ ngắn).
 */
export function runWithCrossTabStorageLock<T>(
  fn: () => T | Promise<T>,
): Promise<T> {
  if (typeof window === "undefined") {
    return Promise.resolve(fn() as T | Promise<T>) as Promise<T>;
  }

  const locks = navigator.locks;
  if (locks && typeof locks.request === "function") {
    return new Promise<T>((resolve, reject) => {
      void locks.request(
        GAME_LOCK_NAME,
        { mode: "exclusive" },
        async () => {
          try {
            resolve(await Promise.resolve(fn()));
          } catch (e) {
            reject(e);
          }
        },
      );
    });
  }

  const holder = randomHolderId();
  const deadline = Date.now() + FALLBACK_WAIT_MS;

  const tryTake = (): boolean => {
    const now = Date.now();
    const raw = window.localStorage.getItem(FALLBACK_LOCK_KEY);
    if (raw) {
      try {
        const { h, until } = JSON.parse(raw) as { h: string; until: number };
        if (until > now && h !== holder) return false;
      } catch {
        /* coi như trống */
      }
    }
    const payload = JSON.stringify({
      h: holder,
      until: now + FALLBACK_TTL_MS,
    });
    window.localStorage.setItem(FALLBACK_LOCK_KEY, payload);
    return window.localStorage.getItem(FALLBACK_LOCK_KEY) === payload;
  };

  const release = () => {
    const cur = window.localStorage.getItem(FALLBACK_LOCK_KEY);
    if (!cur) return;
    try {
      const p = JSON.parse(cur) as { h: string };
      if (p.h === holder) window.localStorage.removeItem(FALLBACK_LOCK_KEY);
    } catch {
      /* empty */
    }
  };

  return new Promise<T>((resolve, reject) => {
    void (async () => {
      while (Date.now() < deadline) {
        if (tryTake()) {
          try {
            resolve(await Promise.resolve(fn()));
          } catch (e) {
            reject(e);
          } finally {
            release();
          }
          return;
        }
        await new Promise((r) =>
          setTimeout(r, 20 + Math.floor(Math.random() * 45)),
        );
      }
      reject(
        new Error(
          "Đang xử lý trên tab khác hoặc mạng chậm — đợi vài giây rồi thử lại.",
        ),
      );
    })();
  });
}
