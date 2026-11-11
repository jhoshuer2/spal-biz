"use client";
import { useState } from "react";
import { Button, Orb, TextField } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase";
import { SaveAccount } from "./SaveAccount";

type Answers = { name: string; sells: string; shop: string };

/** Three questions, one at a time, in Spal's voice. No sign-up, no tour. */
export function Onboarding({ onDone, error, busy }: { onDone: (a: Answers) => void; error?: string | null; busy?: boolean }) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>({ name: "", sells: "", shop: "" });
  const [signin, setSignin] = useState(false);

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
    <main data-mood="normal" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
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
        {step === 0 && !busy && <Button kind="ghost" block onClick={() => setSignin(true)}>I already use Spal</Button>}
      </div>
      <p className="label" style={{ textAlign: "center", fontSize: 14, margin: "0 20px 20px" }}>By continuing you agree to our <a href="/terms" style={{ textDecoration: "underline" }}>Terms</a> and <a href="/privacy" style={{ textDecoration: "underline" }}>Privacy</a>.</p>
      <SaveAccount open={signin} onClose={() => setSignin(false)} sb={supabaseBrowser()} mode="signin" />
    </main>
  );
}
