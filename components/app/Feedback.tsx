"use client";
import { useState } from "react";
import { Button, Icon, Sheet } from "@/components/ui";
import { sendFeedback } from "@/lib/report";
import type { SupabaseClient } from "@supabase/supabase-js";

/** "Something wrong? Tell us." Goes straight to the person building Spal. */
export function Feedback({ open, onClose, sb, shopId, lastCaptureId }: { open: boolean; onClose: () => void; sb: SupabaseClient; shopId: string; lastCaptureId?: string | null }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function close() { setText(""); setDone(false); setErr(null); onClose(); }

  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true); setErr(null);
    const ok = await sendFeedback(sb, shopId, text.trim(), { path: location.pathname, last_capture_id: lastCaptureId ?? null });
    setBusy(false);
    if (!ok) { setErr("I couldn't send that. Please try again."); return; }
    setDone(true);
  }

  return (
    <Sheet open={open} onClose={close} title="Tell us">
      {done ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--good-text)", marginBottom: 8 }}><Icon name="check" size={24} /><span style={{ fontWeight: 600 }}>Thank you</span></div>
          <p className="label" style={{ margin: "0 0 20px", fontSize: 17 }}>I've sent it to the person building Spal. They read every one.</p>
          <Button block onClick={close}>Done</Button>
        </>
      ) : (
        <>
          <h2 className="head" style={{ fontSize: 28, margin: "0 0 8px" }}>Something wrong?</h2>
          <p className="label" style={{ margin: "0 0 16px", fontSize: 17 }}>Tell us what happened, or what you wish Spal did.</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} autoFocus aria-label="Your message" placeholder="For example: I said I sold 3 bags but it wrote 2"
            style={{ width: "100%", padding: "14px 16px", borderRadius: 16, border: 0, background: "var(--surface-2)", color: "var(--ink)", font: "inherit", resize: "vertical" }} />
          {err && <p role="alert" style={{ color: "var(--care-text)", margin: "12px 4px 0" }}>{err}</p>}
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            <Button block onClick={send} disabled={!text.trim() || busy}>{busy ? "One moment" : "Send"}</Button>
            <Button kind="ghost" block onClick={close}>Cancel</Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
