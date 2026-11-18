"use client";
import { useEffect, useState, type ComponentType } from "react";
import { Button, Icon, Logo, Sheet, TextField } from "@/components/ui";
import { SpalFace } from "./SpalFace";
import { playLine, stopSpeaking, unlockSpeech } from "@/lib/speak";
import type { SupabaseClient } from "@supabase/supabase-js";

type Answers = { name: string; sells: string; shop: string };

const TILES = [
  { id: "food", em: "🍲", label: "Food & drinks" },
  { id: "provisions", em: "🛒", label: "Provisions & groceries" },
  { id: "fashion", em: "👗", label: "Fashion & beauty" },
  { id: "phones", em: "📱", label: "Phones & electronics" },
  { id: "building", em: "🧱", label: "Building & hardware" },
  { id: "health", em: "💊", label: "Pharmacy & health" },
  { id: "services", em: "💇", label: "Salon & services" },
  { id: "other", em: "✨", label: "Something else" },
];
const LINES = ["", "/spal/voice/q-name.mp3", "/spal/voice/q-sells.mp3", "/spal/voice/q-shop.mp3"];

/**
 * Meeting Spal: a welcome, then three short questions asked by Spal's face (name, what she sells, shop name).
 * Spal speaks each question. No sign-up, no tour: her account is made quietly when she finishes.
 */
export function Onboarding({ onDone, error, busy }: { onDone: (a: Answers) => void; error?: string | null; busy?: boolean }) {
  const [step, setStep] = useState(0); // 0 welcome, 1 name, 2 sells, 3 shop
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [shop, setShop] = useState("");
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
    if (w.__typed?.name) setName((cur) => cur || w.__typed!.name);
    if (w.__early === "signin") { w.__early = null; setSignin(true); prepare(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Spal asks each question out loud when she arrives on it (her tap on the previous button lets the phone play sound).
  useEffect(() => { if (step > 0 && LINES[step]) playLine(LINES[step]); return () => stopSpeaking(); }, [step]);

  const first = name.trim().split(/\s+/)[0];
  const labels = TILES.filter((t) => picked.includes(t.id) && t.id !== "other").map((t) => t.label);
  const sells = [...labels, ...(picked.includes("other") && other.trim() ? [other.trim()] : [])].join(", ");
  const canNext = step === 1 ? !!name.trim() : step === 2 ? !!sells : step === 3 ? true : true;
  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 && id !== "other" ? cur : [...cur, id]));

  const next = () => {
    if (busy || !canNext) return;
    unlockSpeech();
    if (step < 3) { setStep(step + 1); return; }
    onDone({ name: name.trim(), sells: sells.trim(), shop: shop.trim() || `${first}'s shop` });
  };

  const q = step === 1 ? "Hi, I'm Spal. I'll keep your shop's book, so you never lose track of your money. What should I call you?"
    : step === 2 ? `Lovely to meet you, ${first}. What do you sell?`
    : "And what is your shop called?";

  return (
    <main className="boot-new ob" data-mood="normal">
      {step === 0 ? (
        <>
          <SpalFace size="hero" state={busy ? "thinking" : "idle"} level={0} evening={false} pills={[]} onPill={() => {}} status={false}
            header={<div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px 6px 8px", borderRadius: 999, background: "rgb(255 255 255 / 0.85)", backdropFilter: "blur(8px)" }}><Logo size={30} /><span className="head" style={{ fontSize: 22, textShadow: "none" }}>Spal</span></div>} />
          <div className="ob-hero-copy">
            <h1 className="ob-hero-title">Your shop's assistant</h1>
            <p className="ob-hero-sub">Tell me what you sold, what you spent and who owes you. I'll keep your book.</p>
          </div>
          <div style={{ flex: 1 }} />
          <div className="ob-cta">
            <Button block onClick={() => { unlockSpeech(); setStep(1); }}>Get started</Button>
            {!busy && <Button kind="ghost" block data-early="signin" onClick={() => { setSignin(true); prepare(); }}>I already use Spal</Button>}
            <p className="label" style={{ textAlign: "center", fontSize: 14, margin: "4px 0 0" }}>By continuing you agree to our <a href="/terms" style={{ textDecoration: "underline" }}>Terms</a> and <a href="/privacy" style={{ textDecoration: "underline" }}>Privacy</a>.</p>
          </div>
        </>
      ) : (
        <>
          <div className="ob-bar">
            <button className="ob-back" aria-label="Back" disabled={busy} onClick={() => setStep(step - 1)}><span style={{ display: "grid", transform: "rotate(180deg)" }}><Icon name="chevron" size={22} /></span></button>
            <div className="ob-progress" aria-hidden="true">{[1, 2, 3].map((n) => <span key={n} className="ob-seg" data-on={n <= step} />)}</div>
          </div>
          <SpalFace size="compact" state={busy ? "thinking" : "idle"} level={0} evening={false} pills={[]} onPill={() => {}} status={false} />
          <div className="ob-body">
            <div className="bubble spal" key={step} style={{ maxWidth: "100%" }}><span>{q}</span></div>
            {step === 1 && <TextField key="n" value={name} onChange={setName} placeholder="Your name" onSubmit={next} autoFocus name="name" />}
            {step === 2 && (
              <>
                <div className="tiles">
                  {TILES.map((t) => <button key={t.id} className="tile" aria-pressed={picked.includes(t.id)} onClick={() => toggle(t.id)}><span className="em">{t.em}</span>{t.label}</button>)}
                </div>
                {picked.includes("other") && <TextField value={other} onChange={setOther} placeholder="What do you sell?" onSubmit={next} autoFocus name="sells" />}
                <p className="label" style={{ margin: 0, fontSize: 15 }}>Pick up to three.</p>
              </>
            )}
            {step === 3 && <TextField key="s" value={shop} onChange={setShop} placeholder="Your shop's name" onSubmit={next} autoFocus name="shop" />}
            {error && <p role="alert" style={{ color: "var(--care-text)", margin: "0 4px" }}>{error}</p>}
          </div>
          <div className="ob-cta">
            <Button block onClick={next} disabled={!canNext || busy}>{busy ? "One moment" : step === 3 ? "Let's go" : "Next"}</Button>
            {step === 3 && !busy && !shop.trim() && <p className="label" style={{ textAlign: "center", fontSize: 14, margin: 0 }}>No name yet? Just tap Let's go.</p>}
          </div>
        </>
      )}
      {signin && (Save && sb
        ? <Save open onClose={() => setSignin(false)} sb={sb} mode="signin" />
        : <Sheet open onClose={() => setSignin(false)} title="Sign in"><p className="label" style={{ textAlign: "center", margin: "28px 0" }}>One moment</p></Sheet>)}
    </main>
  );
}
