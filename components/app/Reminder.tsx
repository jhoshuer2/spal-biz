"use client";
import { useState } from "react";
import { Button, Icon, Surface, TextField } from "@/components/ui";
import { waLink, whatsappNumber } from "@/lib/reminders";

type Props = {
  title: string; draft: string; name: string; phone: string | null;
  onSent: (final: { text: string; edited: boolean; phone: string | null }) => void;
  onLater: () => void;
};

/**
 * What Spal wants to do, in her voice. She sees every word first, can change it, and Spal only
 * opens WhatsApp with it ready. She taps send there, so nothing leaves without her.
 */
export function ReminderCard({ title, draft, name, phone, onSent, onLater }: Props) {
  const [text, setText] = useState(draft);
  const [step, setStep] = useState<"view" | "edit" | "phone" | "done">("view");
  const [number, setNumber] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const edited = text !== draft;

  function open(p: string | null) {
    // Opened straight from her tap, so the phone allows it.
    window.open(waLink(p, text), "_blank", "noopener");
    onSent({ text, edited, phone: p });
    setStep("done");
  }

  function yes() {
    if (phone) return open(phone);
    setStep("phone");
  }

  function withNumber() {
    const p = whatsappNumber(number);
    if (!p) { setErr("That doesn't look like a phone number. Try 0803 123 4567."); return; }
    open(p);
  }

  const big = { margin: 0, fontSize: 20, fontWeight: 500, lineHeight: 1.35 } as const;

  if (step === "done")
    return (
      <Surface>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--good-text)", fontWeight: 600 }}><Icon name="check" size={22} /> WhatsApp is open</div>
        <p className="label" style={{ margin: "8px 0 0", fontSize: 17 }}>Tap send there when you're ready. I'll keep track.</p>
      </Surface>
    );

  return (
    <Surface>
      <p style={big}>{title}</p>

      {step === "phone" ? (
        <>
          <p className="label" style={{ margin: "16px 0 8px", fontSize: 17 }}>What's {name}'s number? Then it goes straight to them.</p>
          <TextField value={number} onChange={setNumber} onSubmit={withNumber} placeholder="0803 123 4567" autoFocus />
          {err && <p role="alert" style={{ color: "var(--care-text)", margin: "10px 4px 0" }}>{err}</p>}
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            <Button block onClick={withNumber} disabled={!number.trim()}>Open WhatsApp</Button>
            <Button kind="ghost" block onClick={() => open(null)}>Skip, I'll pick them myself</Button>
          </div>
        </>
      ) : (
        <>
          <p className="label" style={{ margin: "16px 0 0" }}>Message</p>
          {step === "edit" ? (
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} autoFocus aria-label="Message"
              style={{ width: "100%", marginTop: 8, padding: "14px 16px", borderRadius: 16, border: 0, background: "var(--surface-2)", color: "var(--ink)", font: "inherit", resize: "vertical" }} />
          ) : (
            <div style={{ background: "var(--surface-2)", borderRadius: 16, padding: "14px 16px", marginTop: 8 }}>{text}</div>
          )}
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            <Button block onClick={yes} disabled={!text.trim()}>Yes, send it</Button>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {step === "edit"
                ? <Button kind="secondary" small onClick={() => setStep("view")}>Done editing</Button>
                : <Button kind="secondary" small onClick={() => setStep("edit")}>Change it</Button>}
              <Button kind="ghost" small onClick={onLater}>Not now</Button>
            </div>
          </div>
        </>
      )}
    </Surface>
  );
}
