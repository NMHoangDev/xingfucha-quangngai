/** Phát hiện heuristic iOS đang mở trong WebView / trình nhúng (không phải Safari độc lập đầy đủ). */
export function isLikelyIOSInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (!/iPhone|iPad|iPod/i.test(ua)) return false;

  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return false;

  const markers = [
    "FBAN",
    "FBAV",
    "Instagram",
    "Line/",
    "MicroMessenger",
    "Zalo",
    "; wv)",
    "WKWebView",
    "AlipayClient",
    "QQ/",
    "MQQBrowser",
    "baiduboxapp",
    "BytedanceWebview",
    "Toutiao",
  ];
  return markers.some((m) => ua.includes(m));
}

/** Android: WebView / trình nhúng trong app quét hoặc MXH. */
export function isLikelyAndroidInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (!/Android/i.test(ua)) return false;

  const markers = [
    "; wv)",
    "WebView",
    "FBAN",
    "FBAV",
    "Instagram",
    "Line/",
    "MicroMessenger",
    "Zalo",
  ];
  return markers.some((m) => ua.includes(m));
}

function isMobileUa(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
}

/**
 * Hiện modal bắt buộc dùng Camera: WebView nhận diện được,
 * hoặc URL có `?from_qr=1` (nên gắn vào mã QR để luôn nhắc trên mobile).
 */
export function shouldShowForcedCameraQrHint(openedFromQrParam: boolean): boolean {
  if (typeof navigator === "undefined") return false;
  if (!isMobileUa()) return false;

  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return false;

  if (openedFromQrParam) return true;
  if (isLikelyIOSInAppBrowser()) return true;
  if (isLikelyAndroidInAppBrowser()) return true;
  return false;
}

/** @deprecated dùng shouldShowForcedCameraQrHint */
export function shouldShowSafariHint(options: {
  openedFromQrParam: boolean;
}): boolean {
  return shouldShowForcedCameraQrHint(options.openedFromQrParam);
}
