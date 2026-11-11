"use client";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser, type Shop } from "@/lib/supabase";
import { getCaptchaToken, warmCaptcha } from "@/lib/captcha";
import { Orb } from "@/components/ui";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { Onboarding } from "./Onboarding";
import { Today } from "./Today";

type View = { kind: "loading" } | { kind: "onboarding" } | { kind: "today"; shop: Shop } | { kind: "offline" };

/** Opens straight into the product. A private account is created silently; she is asked to save it later. */
export function App() {
  const { setMode } = useTheme();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        // New here, or signing in: show the first screen at once. The private account is made only when she finishes the questions.
        warmCaptcha();
        setView({ kind: "onboarding" });
        return;
      }
      const { data: shop, error: se } = await sb.from("shop").select("*").maybeSingle();
      if (se) throw se;
      if (shop) {
        const t = (shop as Shop).theme;
        if (t === "light" || t === "dark" || t === "auto") setMode(t as ThemeMode);
        setView({ kind: "today", shop: shop as Shop });
      } else setView({ kind: "onboarding" });
    } catch {
      setView({ kind: "offline" });
    }
  }, [setMode]);

  useEffect(() => { load(); }, [load]);

  async function create(a: { name: string; sells: string; shop: string }) {
    setBusy(true);
    setError(null);
    const sb = supabaseBrowser();
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
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

  if (view.kind === "loading") return <main style={{ minHeight: "100dvh", background: "var(--bg)", display: "grid", placeItems: "center" }}><Orb tone="lilac" size={96} state="thinking" /></main>;
  if (view.kind === "offline")
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
        <div>
          <h1 className="head" style={{ fontSize: 32, margin: "0 0 12px" }}>I can't reach my notes</h1>
          <p className="label" style={{ margin: "0 0 24px", fontSize: 16 }}>Check your connection and try again.</p>
          <button className="btn btn-primary" onClick={() => { setView({ kind: "loading" }); load(); }}>Try again</button>
        </div>
      </main>
    );
  if (view.kind === "onboarding") return <Onboarding onDone={create} busy={busy} error={error} />;
  return <Today shop={view.shop} />;
}
