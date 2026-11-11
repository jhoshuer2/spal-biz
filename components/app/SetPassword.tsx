"use client";
import { useState } from "react";
import { Button, Icon, Sheet, TextField } from "@/components/ui";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Lets her sign in with a password next time, instead of waiting for an email. Opens from Profile once her account is saved. */
export function SetPassword({ open, onClose, sb, email }: { open: boolean; onClose: () => void; sb: SupabaseClient; email: string | null }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = pw.length >= 8;

  function close() { setPw(""); setShow(false); setDone(false); setErr(null); onClose(); }

  async function save() {
    if (!ok || busy) return;
    setBusy(true);
    setErr(null);
    const { error } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      const m = error.message.toLowerCase();
      setErr(m.includes("same") ? "That's already your password." : m.includes("weak") || m.includes("short") || m.includes("least") ? "That password is too easy to guess. Try a longer one." : m.includes("reauth") || m.includes("recent") ? "For safety, please sign in again, then set your password." : "I couldn't save that. Please try again.");
      return;
    }
    setDone(true);
  }

  return (
    <Sheet open={open} onClose={close} title="Password">
      {done ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--good-text)", marginBottom: 8 }}><Icon name="check" size={24} /><span style={{ fontWeight: 600 }}>Password saved</span></div>
          <p className="label" style={{ margin: "0 0 20px", fontSize: 17 }}>Next time, sign in with {email ?? "your email"} and this password.</p>
          <Button block onClick={close}>Done</Button>
        </>
      ) : (
        <>
          <h2 className="head" style={{ fontSize: 28, margin: "0 0 8px" }}>Choose a password</h2>
          <p className="label" style={{ margin: "0 0 16px", fontSize: 17 }}>At least 8 characters. You'll use it with {email ?? "your email"} to sign in without waiting for a link.</p>
          <TextField type={show ? "text" : "password"} autoComplete="new-password" value={pw} onChange={setPw} onSubmit={save} placeholder="New password" autoFocus
            trailing={<button className="chip" style={{ minHeight: 36 }} onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button>} />
          {pw.length > 0 && !ok && <p className="label" style={{ margin: "8px 4px 0", fontSize: 15 }}>{8 - pw.length} more {8 - pw.length === 1 ? "character" : "characters"}</p>}
          {err && <p role="alert" style={{ color: "var(--care-text)", margin: "12px 4px 0" }}>{err}</p>}
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            <Button block onClick={save} disabled={!ok || busy}>{busy ? "One moment" : "Save password"}</Button>
            <Button kind="ghost" block onClick={close}>Cancel</Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
