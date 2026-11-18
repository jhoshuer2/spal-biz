/** Putting Spal on the home screen: what the phone can do, and what to show her. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: InstallEvent | null = null;
let installed = false;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallEvent; });
  window.addEventListener("appinstalled", () => { installed = true; deferred = null; });
}

export const isStandalone = () =>
  typeof window !== "undefined" && (installed || window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
export const platform = (): "ios" | "android" | "other" => {
  if (typeof navigator === "undefined") return "other";
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return "ios";
  return /Android/i.test(navigator.userAgent) ? "android" : "other";
};
/** Opened from inside Facebook or Instagram: those cannot add to the home screen. */
export const inAppBrowser = () => typeof navigator !== "undefined" && /FBAN|FBAV|Instagram|Line\//i.test(navigator.userAgent);
export const canPromptInstall = () => !!deferred;
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  const d = deferred;
  deferred = null;
  try { await d.prompt(); return (await d.userChoice).outcome; } catch { return "unavailable"; }
}

// How often we have asked. Twice is enough: once after the first sale, once after her first closed day.
const key = "spal-a2hs";
const read = () => { try { return JSON.parse(localStorage.getItem(key) ?? "{}") as { n?: number; done?: boolean; at?: number }; } catch { return {}; } };
export const a2hsDue = (minGapMs = 0) => { const s = read(); return !isStandalone() && !s.done && (s.n ?? 0) < 2 && Date.now() - (s.at ?? 0) >= minGapMs; };
export const a2hsShown = () => { const s = read(); try { localStorage.setItem(key, JSON.stringify({ ...s, n: (s.n ?? 0) + 1, at: Date.now() })); } catch { /* private mode */ } };
export const a2hsDone = () => { const s = read(); try { localStorage.setItem(key, JSON.stringify({ ...s, done: true })); } catch { /* private mode */ } };
export const a2hsShownCount = () => read().n ?? 0;
