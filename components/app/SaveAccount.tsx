"use client";
import { useEffect, useState } from "react";
import { Button, Icon, Sheet, TextField } from "@/components/ui";
import { getCaptchaToken } from "@/lib/captcha";
import type { SupabaseClient } from "@supabase/supabase-js";

const GOOGLE = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === "1";

type Step = "choose" | "email" | "password" | "sent";

/**
 * Asked once she has something worth keeping. Her private account becomes a real one in place,
 * so nothing she told Spal is lost. Same sheet signs an existing account in (mode "signin").
 */
export function SaveAccount({ open, onClose, sb, mode = "save", ownerFirst }: { open: boolean; onClose: () => void; sb: SupabaseClient; mode?: "save" | "signin"; ownerFirst?: string }) {
  const [step, setStep] = useState<Step>(mode === "signin" ? "email" : "choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [wait, setWait] = useState(0); // seconds until another email can be asked for
  const [again, setAgain] = useState(false);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  async function sendEmail(resend = false) {
    if (!valid || busy || (resend && wait > 0)) return;
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
    setAgain(resend);
    setWait(60);
    setStep("sent");
  }

  async function signInWithPassword() {
    if (!valid || !pw || busy) return;
    setBusy(true);
    setErr(null);
    const captchaToken = await getCaptchaToken().catch(() => undefined);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: pw, options: captchaToken ? { captchaToken } : undefined });
    setBusy(false);
    if (error) { setErr("That email or password didn't work. You can ask for a link instead."); return; }
    window.location.reload();
  }

  async function verify() {
    if (!code.trim() || busy) return;
    setBusy(true);
    setErr(null);
    const to = email.trim().toLowerCase();
    // The email can be a sign-in message or a confirmation, depending on the account, so try each kind of code.
    const kinds = mode === "save" ? (["email_change"] as const) : (["email", "signup", "magiclink"] as const);
    let ok = false;
    for (const type of kinds) {
      const { error } = await sb.auth.verifyOtp({ email: to, token: code.replace(/\D/g, ""), type });
      if (!error) { ok = true; break; }
    }
    setBusy(false);
    if (!ok) { setErr("That code didn't work. It may have run out. You can ask for a new one."); return; }
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
          <TextField value={email} onChange={setEmail} onSubmit={() => sendEmail()} placeholder="Your email" autoFocus />
          {err && <p role="alert" style={{ color: "var(--care-text)", margin: "12px 4px 0" }}>{err}</p>}
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            {mode === "signin" ? (
              <>
                <Button block onClick={() => { setErr(null); setStep("password"); }} disabled={!valid}>Use my password</Button>
                <Button kind="secondary" block onClick={() => sendEmail()} disabled={!valid || busy}>{busy ? "One moment" : "Email me a link instead"}</Button>
              </>
            ) : (
              <Button block onClick={() => sendEmail()} disabled={!valid || busy}>{busy ? "One moment" : "Send me a link"}</Button>
            )}
            {mode === "save" && <Button kind="ghost" block onClick={() => setStep("choose")}>Back</Button>}
          </div>
        </>
      )}

      {step === "password" && (
        <>
          <h2 className="head" style={{ fontSize: 28, margin: "0 0 4px" }}>Your password</h2>
          <p className="label" style={{ margin: "0 0 16px", fontSize: 17 }}>{email.trim()}</p>
          <TextField type={showPw ? "text" : "password"} autoComplete="current-password" value={pw} onChange={setPw} onSubmit={signInWithPassword} placeholder="Password" autoFocus
            trailing={<button className="chip" style={{ minHeight: 36 }} onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}>{showPw ? "Hide" : "Show"}</button>} />
          {err && <p role="alert" style={{ color: "var(--care-text)", margin: "12px 4px 0" }}>{err}</p>}
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            <Button block onClick={signInWithPassword} disabled={!pw || busy}>{busy ? "One moment" : "Sign in"}</Button>
            <Button kind="secondary" block onClick={() => sendEmail()} disabled={busy}>Email me a link instead</Button>
            <Button kind="ghost" block onClick={() => { setErr(null); setStep("email"); }}>Back</Button>
          </div>
        </>
      )}

      {step === "sent" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--good-text)", marginBottom: 8 }}><Icon name="check" size={24} /><span style={{ fontWeight: 600 }}>{again ? "Sent again" : "Check your email"}</span></div>
          <h2 className="head" style={{ fontSize: 26, margin: "0 0 8px" }}>I sent a message to {email.trim()}</h2>
          <p className="label" style={{ margin: "0 0 16px", fontSize: 17 }}>Type the code from the email here, or tap the link in it on this phone.</p>
          <TextField value={code} onChange={(v) => setCode(v.replace(/\D/g, ""))} onSubmit={verify} placeholder="Code from the email" inputMode="numeric" autoComplete="one-time-code" />
          {err && <p role="alert" style={{ color: "var(--care-text)", margin: "12px 4px 0" }}>{err}</p>}
          <p className="label" style={{ margin: "12px 4px 0", fontSize: 15 }}>Nothing yet? It can take a minute. Check your spam or junk folder too.</p>
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            <Button block onClick={verify} disabled={!code.trim() || busy}>{busy ? "One moment" : "Use code"}</Button>
            <Button kind="secondary" block onClick={() => sendEmail(true)} disabled={wait > 0 || busy}>{wait > 0 ? `Send it again in ${wait}s` : "Send it again"}</Button>
            <Button kind="ghost" block onClick={() => { setCode(""); setErr(null); setStep(mode === "signin" ? "email" : "email"); }}>Use a different email</Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
