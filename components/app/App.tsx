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

  async function create(a: { name: string; sells: string; shop: string }) {
    setBusy(true);
    setError(null);
    let sb;
    try {
      sb = await sbClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        const { getCaptchaToken } = await import("@/lib/captcha");
        const captchaToken = await getCaptchaToken();
        const { error: ae } = await sb.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined);
        if (ae) throw ae;
      }
    } catch {
      setBusy(false);
      setError("I couldn't get started just now. Please try again.");
      return;
    }
    const { data, error: e } = await sb.from("shop").insert({ owner_name: a.name, sells: a.sells, name: a.shop }).select("*").single();
    setBusy(false);
    if (e || !data) { setError("I couldn't save that. Please try again."); return; }
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
