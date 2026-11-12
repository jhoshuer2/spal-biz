"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { Shop } from "@/lib/supabase";
import { Orb } from "@/components/ui";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { Onboarding } from "./Onboarding";

type View = { kind: "boot" } | { kind: "onboarding" } | { kind: "today"; shop: Shop; offline?: boolean } | { kind: "offline" };
const CACHE = "spal-shop";

// Everything after the first screen is fetched only when it is needed, so the first screen is not waiting on it.
const Today = dynamic(() => import("./Today").then((m) => m.Today), { ssr: false, loading: () => <Waiting /> });
const sbClient = () => import("@/lib/supabase").then((m) => m.supabaseBrowser());

const hasSessionCookie = () => /(?:^|;\s*)sb-[^=]*-auth-token/.test(document.cookie);
/** Tells the page whether to show the questions (new phone) or the quiet placeholder (she has signed in here before). */
const setBoot = (returning: boolean) => { document.documentElement.dataset.boot = returning ? "returning" : "new"; };

function Waiting() {
  return <main style={{ minHeight: "100dvh", background: "var(--bg)", display: "grid", placeItems: "center" }}><Orb tone="lilac" size={96} state="thinking" /></main>;
}

/**
 * Opens straight into the product. A new visitor sees the first question in the page itself, with no waiting for code or a connection.
 * A private account is created only when she finishes the questions; she is asked to save it later.
 */
export function App() {
  const { setMode } = useTheme();
  const [view, setView] = useState<View>({ kind: "boot" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasSessionCookie()) {
      // Never signed in on this phone: nothing to look up. Show the questions and get the captcha ready in the background.
      setBoot(false);
      setView({ kind: "onboarding" });
      import("@/lib/captcha").then((m) => m.warmCaptcha());
      return;
    }
    try {
      const sb = await sbClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setBoot(false); setView({ kind: "onboarding" }); import("@/lib/captcha").then((m) => m.warmCaptcha()); return; }
      const { data: shop, error: se } = await sb.from("shop").select("*").maybeSingle();
      if (se) throw se;
      if (shop) {
        const t = (shop as Shop).theme;
        if (t === "light" || t === "dark" || t === "auto") setMode(t as ThemeMode);
        try { localStorage.setItem(CACHE, JSON.stringify(shop)); } catch { /* storage full or blocked */ }
        setView({ kind: "today", shop: shop as Shop });
      } else { setBoot(false); setView({ kind: "onboarding" }); }
    } catch {
      // No signal: open with what we last knew, so she can still tell Spal things.
      let cached: Shop | null = null;
      try { cached = JSON.parse(localStorage.getItem(CACHE) ?? "null"); } catch { /* ignore */ }
      if (cached && navigator.onLine === false) setView({ kind: "today", shop: cached, offline: true });
      else setView({ kind: "offline" });
    }
  }, [setMode]);

  useEffect(() => { load(); }, [load]);
  // Let the app open without signal, and pick up again when it returns. Both wait until the first screen is settled.
  useEffect(() => {
    const t = setTimeout(() => {
      if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
      Promise.all([sbClient(), import("@/lib/report")]).then(([sb, r]) => r.watchErrors(sb, () => null)).catch(() => {});
    }, 2500);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const back = () => setView((v) => { if (v.kind === "today" && v.offline) { setBoot(true); load(); return { kind: "boot" }; } return v; });
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, [load]);

  type Why = "rate" | "captcha" | "network" | "other";
  const classify = (e: unknown): Why => {
    const x = e as { status?: number; code?: string; message?: string } | null;
    const text = `${x?.message ?? ""} ${x?.code ?? ""}`;
    if (x?.status === 429 || /rate.?limit|over_request|too many|over_.*_rate/i.test(text)) return "rate";
    if (/captcha/i.test(text)) return "captcha";
    if (navigator.onLine === false || /failed to fetch|networkerror|network request|load failed|fetch failed|timeout|chunk/i.test(text)) return "network";
    return "other";
  };
  const WHY: Record<Why, string> = {
    rate: "A lot of people are signing up right now. Please wait a few minutes and try again.",
    captcha: "I couldn't check that you're a real person. Please try again.",
    network: "I can't connect. Please check your data or Wi-Fi and try again.",
    other: "I couldn't get started just now. Please try again.",
  };
  /** Tell the person running Spal why someone could not get started. They have no account yet, so this goes through a small open door. */
  const diag = (stage: string, why: Why, e: unknown, attempt: number) => {
    const x = e as { status?: number; code?: string; message?: string } | null;
    const conn = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
    fetch("/api/diag", { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({ stage, why, status: x?.status, code: x?.code, detail: x?.message, online: navigator.onLine, attempt, network: conn?.effectiveType, commit: process.env.NEXT_PUBLIC_COMMIT }) }).catch(() => {});
  };

  async function create(a: { name: string; sells: string; shop: string }) {
    setBusy(true);
    setError(null);
    let sb;
    try {
      sb = await sbClient();
    } catch (e) {
      setBusy(false); setError(WHY[classify(e)]); diag("signup-load", classify(e), e, 1);
      return;
    }
    // Make the private account. A flaky connection or a slow captcha is retried once on its own, with a fresh check.
    let lastErr: unknown = null, why: Why = "other";
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) {
          const { getCaptchaToken } = await import("@/lib/captcha");
          const captchaToken = await getCaptchaToken();
          const { error: ae } = await sb.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined);
          if (ae) throw ae;
        }
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e; why = classify(e);
        diag(String((e as Error)?.message ?? "").toLowerCase().includes("captcha") ? "signup-captcha" : "signup-account", why, e, attempt);
        if (why === "rate" || attempt === 2) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    if (lastErr) { setBusy(false); setError(WHY[why]); return; }
    const { data, error: e } = await sb.from("shop").insert({ owner_name: a.name, sells: a.sells, name: a.shop }).select("*").single();
    setBusy(false);
    if (e || !data) { diag("signup-shop", classify(e), e, 1); setError("I couldn't save that. Please try again."); return; }
    setView({ kind: "today", shop: data as Shop });
  }

  if (view.kind === "offline")
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
        <div>
          <h1 className="head" style={{ fontSize: 32, margin: "0 0 12px" }}>I can't reach my notes</h1>
          <p className="label" style={{ margin: "0 0 24px", fontSize: 16 }}>Check your connection and try again.</p>
          <button className="btn btn-primary" onClick={() => { setBoot(true); setView({ kind: "boot" }); load(); }}>Try again</button>
        </div>
      </main>
    );
  if (view.kind === "today") return <Today shop={view.shop} offline={view.offline} />;

  // "boot" and "onboarding" draw the same thing, so the questions never flicker or reset when Spal finishes checking.
  return (
    <>
      <Onboarding onDone={create} busy={busy} error={error} />
      <main className="boot-ret"><Orb tone="lilac" size={96} state="thinking" /></main>
    </>
  );
}
