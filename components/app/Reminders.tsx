"use client";
import { useEffect, useState } from "react";
import { Button, Icon, Surface, Toggle } from "@/components/ui";
import { disablePush, enablePush, isIOS, isStandalone, isSubscribed, pushConfigured, pushSupported, useInstall } from "@/lib/push";
import type { SupabaseClient } from "@supabase/supabase-js";

const DISMISS = "spal-push-dismissed";
const recentlyDismissed = () => { try { const t = Number(localStorage.getItem(DISMISS) ?? 0); return Date.now() - t < 7 * 24 * 3600 * 1000; } catch { return false; } };

/** Reminder state for this phone, shared by the opt-in card and the Profile controls. */
export function useReminders(sb: SupabaseClient, shopId: string, getToken: () => Promise<string>) {
  const [on, setOn] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const supported = pushConfigured && pushSupported();
  const iosNeedsInstall = pushConfigured && isIOS() && !isStandalone() && !pushSupported();

  useEffect(() => {
    if (!supported) return;
    setBlocked(Notification.permission === "denied");
    isSubscribed().then(setOn);
  }, [supported]);

  async function turnOn() {
    setBusy(true); setNote(null);
    const r = await enablePush(sb, shopId);
    setBusy(false);
    if (r === "ok") setOn(true);
    else if (r === "denied") { setBlocked(true); setNote("Notifications are blocked for Spal. Allow them in your phone's settings, then try again."); }
    else setNote("I couldn't turn reminders on. Please try again.");
    return r === "ok";
  }
  async function turnOff() { setBusy(true); await disablePush(sb); setOn(false); setBusy(false); }
  async function sendTest() {
    setBusy(true); setNote(null);
    try {
      const r = await fetch("/api/push/test", { method: "POST", headers: { Authorization: `Bearer ${await getToken()}` } });
      const j = await r.json();
      setNote(r.ok && j.sent > 0 ? "Sent. Look at your phone." : "I couldn't send it. Try turning reminders off and on again.");
    } catch { setNote("I couldn't send it. Please try again."); }
    setBusy(false);
  }
  return { configured: pushConfigured, supported, on, blocked, busy, note, iosNeedsInstall, turnOn, turnOff, sendTest, askable: supported && !on && !blocked };
}

/** Shown once, after she has closed a day and so knows what Spal is for. Quiet if she says no. */
export function ReminderPrompt({ r }: { r: ReturnType<typeof useReminders> }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => setHidden(recentlyDismissed()), []);
  if (hidden || !(r.askable || r.iosNeedsInstall)) return null;
  const later = () => { try { localStorage.setItem(DISMISS, String(Date.now())); } catch {} setHidden(true); };
  return (
    <Surface>
      {r.iosNeedsInstall ? (
        <>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 500, lineHeight: 1.35 }}>Want me to remind you when it's time to close?</p>
          <p className="label" style={{ margin: "10px 0 0", fontSize: 17 }}>On iPhone, first tap Share, then Add to Home Screen. Open Spal from there and I can remind you.</p>
          <div style={{ marginTop: 12 }}><Button kind="ghost" small onClick={later}>Not now</Button></div>
        </>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 500, lineHeight: 1.35 }}>Want me to remind you when it's time to close?</p>
          <p className="label" style={{ margin: "8px 0 0", fontSize: 17 }}>I'll only speak up when it matters, and never in the night.</p>
          {r.note && <p role="alert" style={{ color: "var(--care-text)", margin: "10px 0 0" }}>{r.note}</p>}
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            <Button block disabled={r.busy} onClick={async () => { if (await r.turnOn()) setHidden(true); }}>{r.busy ? "One moment" : "Yes, remind me"}</Button>
            <Button kind="ghost" block onClick={later}>Not now</Button>
          </div>
        </>
      )}
    </Surface>
  );
}

/** Profile: install on the home screen, reminders on or off, and a test button. */
export function ProfileReminders({ r }: { r: ReturnType<typeof useReminders> }) {
  const inst = useInstall();
  const showInstall = inst.canInstall || inst.iosSteps;
  if (!r.configured && !showInstall) return null;
  return (
    <>
      {showInstall && (
        <>
          <p className="label" style={{ margin: "16px 0 4px" }}>Home screen</p>
          {inst.canInstall ? (
            <button className="row" onClick={inst.install}><span>Add Spal to your home screen</span><Icon name="plus" size={22} /></button>
          ) : (
            <p className="label" style={{ margin: "4px 0 0", fontSize: 16 }}>Tap Share, then Add to Home Screen, to open Spal like an app.</p>
          )}
        </>
      )}
      {r.configured && !r.supported && (
        <>
          <p className="label" style={{ margin: "16px 0 4px" }}>Reminders</p>
          <p className="label" style={{ margin: "4px 0 0", fontSize: 16 }}>
            {r.iosNeedsInstall
              ? "On iPhone, reminders need Spal on your Home Screen. Tap Share, then Add to Home Screen, and open Spal from there."
              : "This browser can't show reminders. Open Spal in Chrome (not inside WhatsApp or another app), or add it to your home screen."}
          </p>
        </>
      )}
      {r.supported && (
        <>
          <p className="label" style={{ margin: "16px 0 4px" }}>Reminders</p>
          <div className="row"><span>Remind me on this phone</span><Toggle checked={r.on} label="Remind me on this phone" onChange={(v) => (v ? r.turnOn() : r.turnOff())} /></div>
          {r.on && <div style={{ marginTop: 4 }}><Button kind="ghost" small onClick={r.sendTest} disabled={r.busy}>Send me a test reminder</Button></div>}
          {r.note && <p role="status" className="label" style={{ margin: "8px 0 0", fontSize: 16 }}>{r.note}</p>}
        </>
      )}
    </>
  );
}
