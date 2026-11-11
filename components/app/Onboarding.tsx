"use client";
import { useEffect, useState, type ComponentType } from "react";
import { Button, Orb, Sheet, TextField } from "@/components/ui";
import type { SupabaseClient } from "@supabase/supabase-js";

type Answers = { name: string; sells: string; shop: string };

/** Three questions, one at a time, in Spal's voice. No sign-up, no tour. */
export function Onboarding({ onDone, error, busy }: { onDone: (a: Answers) => void; error?: string | null; busy?: boolean }) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>({ name: "", sells: "", shop: "" });
  const [signin, setSignin] = useState(false);
  const [Save, setSave] = useState<ComponentType<{ open: boolean; onClose: () => void; sb: SupabaseClient; mode?: "save" | "signin" }> | null>(null);
  const [sb, setSb] = useState<SupabaseClient | null>(null);

  // The sign-in form is only needed if she taps "I already use Spal". Fetch it quietly once the first screen is up, so the tap feels instant.
  const prepare = () => {
    import("./SaveAccount").then((m) => setSave(() => m.SaveAccount));
    import("@/lib/supabase").then((m) => setSb(m.supabaseBrowser()));
  };
  useEffect(() => { const t = setTimeout(prepare, 800); return () => clearTimeout(t); }, []);

  // The page woke up. Pick up anything she did on the first screen while it was still loading.
  useEffect(() => {
    const w = window as unknown as { __hydrated?: boolean; __early?: string | null; __typed?: Record<string, string> };
    w.__hydrated = true;
    if (w.__typed?.name) setA((cur) => ({ ...cur, name: cur.name || w.__typed!.name }));
    if (w.__early === "signin") { w.__early = null; setSignin(true); prepare(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const first = a.name.trim().split(/\s+/)[0];
  const steps = [
    { q: "Hi, I'm Spal. What should I call you?", ph: "Amaka", key: "name" as const },
    { q: `Nice to meet you, ${first}. What do you sell?`, ph: "Provisions", key: "sells" as const },
    { q: "And what is your shop called?", ph: "Amaka Stores", key: "shop" as const },
  ];
  const cur = steps[step];
  const value = a[cur.key];
  const last = step === steps.length - 1;

  const next = () => {
    if (!value.trim() || busy) return;
    if (last) onDone({ name: a.name.trim(), sells: a.sells.trim(), shop: a.shop.trim() });
    else setStep(step + 1);
  };

  return (
    <main className="boot-new" data-mood="normal" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div className="mood-field" style={{ padding: "40px 24px 8px" }}>
        <div style={{ display: "grid", placeItems: "center", paddingBottom: 12 }}>
          <Orb tone="lilac" size={150} state={busy ? "thinking" : "idle"} />
        </div>
        <h1 key={step} className="head" style={{ fontSize: 36, margin: "8px 0 20px", maxWidth: 520 }}>{cur.q}</h1>
      </div>
      <div style={{ padding: "8px 20px", maxWidth: 560, width: "100%", margin: "0 auto", flex: 1 }}>
        <TextField key={step} value={value} onChange={(v) => setA({ ...a, [cur.key]: v })} placeholder={cur.ph} onSubmit={next} autoFocus name={cur.key} />
        {error && <p role="alert" style={{ color: "var(--care-text)", margin: "12px 4px 0" }}>{error}</p>}
      </div>
      <div style={{ padding: "12px 20px 28px", maxWidth: 560, width: "100%", margin: "0 auto", display: "grid", gap: 8 }}>
        <Button block onClick={next} disabled={!value.trim() || busy}>{busy ? "One moment" : last ? "Let's go" : "Next"}</Button>
        {step > 0 && !busy && <Button kind="ghost" block onClick={() => setStep(step - 1)}>Back</Button>}
        {step === 0 && !busy && <Button kind="ghost" block data-early="signin" onClick={() => { setSignin(true); prepare(); }}>I already use Spal</Button>}
      </div>
      <p className="label" style={{ textAlign: "center", fontSize: 14, margin: "0 20px 20px" }}>By continuing you agree to our <a href="/terms" style={{ textDecoration: "underline" }}>Terms</a> and <a href="/privacy" style={{ textDecoration: "underline" }}>Privacy</a>.</p>
      {signin && (Save && sb
        ? <Save open onClose={() => setSignin(false)} sb={sb} mode="signin" />
        : <Sheet open onClose={() => setSignin(false)} title="Sign in"><p className="label" style={{ textAlign: "center", margin: "28px 0" }}>One moment</p></Sheet>)}
    </main>
  );
}
