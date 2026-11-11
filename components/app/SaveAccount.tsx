"use client";
import { useState } from "react";
import { Button, Icon, Sheet, TextField } from "@/components/ui";
import { getCaptchaToken } from "@/lib/captcha";
import type { SupabaseClient } from "@supabase/supabase-js";

const GOOGLE = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === "1";

type Step = "choose" | "email" | "sent";

/**
 * Asked once she has something worth keeping. Her private account becomes a real one in place,
 * so nothing she told Spal is lost. Same sheet signs an existing account in (mode "signin").
 */
export function SaveAccount({ open, onClose, sb, mode = "save", ownerFirst }: { open: boolean; onClose: () => void; sb: SupabaseClient; mode?: "save" | "signin"; ownerFirst?: string }) {
  const [step, setStep] = useState<Step>(mode === "signin" ? "email" : "choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  async function sendEmail() {
    if (!valid || busy) return;
    setBusy(true);
    setErr(null);
    const to = email.trim().toLowerCase();
    const { error } =
      mode === "save"
        ? await sb.auth.updateUser({ email: to }, { emailRedirectTo: window.location.origin })
        : await sb.auth.signInWithOtp({ email: to, options: { shouldCreateUser: false, emailRedirectTo: window.location.origin, captchaToken: await getCaptchaToken().catch(() => undefined) } });
    setBusy(false);
    if (error) {
      const m = error.message.toLowerCase();
      setErr(
        m.includes("already") || m.includes("registered") ? "That email already has a Spal account. Use “I already use Spal” to sign in."
        : m.includes("rate") || m.includes("seconds") ? "Too many tries. Please wait a minute and try again."
        : mode === "signin" ? "I couldn't find an account with that email."
        : "I couldn't send that. Check the email and try again.",
      );
      return;
    }
    setStep("sent");
  }

  async function verify() {
    if (!code.trim() || busy) return;
    setBusy(true);
    setErr(null);
    const to = email.trim().toLowerCase();
    const { error } = await sb.auth.verifyOtp({ email: to, token: code.trim(), type: mode === "save" ? "email_change" : "email" });
    setBusy(false);
    if (error) { setErr("That code didn't work. Check it and try again."); return; }
    window.location.reload();
  }

  async function google() {
    setErr(null);
    const { error } = await sb.auth.linkIdentity({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) setErr("Google isn't ready yet. You can use your email.");
  }

  return (
    <Sheet open={open} onClose={onClose} title={mode === "save" ? "Save your account" : "Sign in"}>
      {step === "choose" && (
        <>
          <h2 className="head" style={{ fontSize: 28, margin: "0 0 8px" }}>Should I save this{ownerFirst ? `, ${ownerFirst}` : ""}?</h2>
          <p className="label" style={{ margin: "0 0 20px", fontSize: 17 }}>That way we can pick up tomorrow, even on a new phone.</p>
          <div style={{ display: "grid", gap: 8 }}>
            {GOOGLE && <Button kind="secondary" block onClick={google}>Continue with Google</Button>}
            <Button block onClick={() => setStep("email")}>Use my email</Button>
            <Button kind="ghost" block onClick={onClose}>Not now</Button>
          </div>
          {err && <p role="alert" style={{ color: "var(--care-text)", margin: "12px 4px 0" }}>{err}</p>}
        </>
      )}

      {step === "email" && (
        <>
          <h2 className="head" style={{ fontSize: 28, margin: "0 0 16px" }}>{mode === "save" ? "What's your email?" : "Sign in with your email"}</h2>
          <TextField value={email} onChange={setEmail} onSubmit={sendEmail} placeholder="amaka@example.com" autoFocus />
          {err && <p role="alert" style={{ color: "var(--care-text)", margin: "12px 4px 0" }}>{err}</p>}
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            <Button block onClick={sendEmail} disabled={!valid || busy}>{busy ? "One moment" : "Send me a link"}</Button>
            {mode === "save" && <Button kind="ghost" block onClick={() => setStep("choose")}>Back</Button>}
          </div>
        </>
      )}

      {step === "sent" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--good-text)", marginBottom: 8 }}><Icon name="check" size={24} /><span style={{ fontWeight: 600 }}>Check your email</span></div>
          <h2 className="head" style={{ fontSize: 26, margin: "0 0 8px" }}>I sent a link to {email.trim()}</h2>
          <p className="label" style={{ margin: "0 0 20px", fontSize: 17 }}>Open it on this phone and you're done. Got a code instead? Type it here.</p>
          <TextField value={code} onChange={setCode} onSubmit={verify} placeholder="6-digit code" />
          {err && <p role="alert" style={{ color: "var(--care-text)", margin: "12px 4px 0" }}>{err}</p>}
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            <Button block onClick={verify} disabled={!code.trim() || busy}>{busy ? "One moment" : "Use code"}</Button>
            <Button kind="ghost" block onClick={onClose}>Close</Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
