"use client";
import { useState } from "react";
import { Button, Icon, Sheet } from "@/components/ui";
import { a2hsDone, canPromptInstall, inAppBrowser, platform, promptInstall } from "@/lib/install";

/** A short, visual guide to putting Spal on the home screen, so it opens like an app and can remind her. */
export function AddToHome({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = platform();
  const [msg, setMsg] = useState<string | null>(null);
  const ios = p === "ios";
  const steps = ios
    ? [{ icon: "share" as const, text: "Tap the Share button at the bottom of Safari." }, { icon: "addBox" as const, text: "Scroll down and tap “Add to Home Screen”." }, { icon: "check" as const, text: "Tap “Add”. Spal is now on your phone." }]
    : [{ icon: "dots" as const, text: "Tap the three dots at the top right of Chrome." }, { icon: "addBox" as const, text: "Tap “Add to Home screen” or “Install app”." }, { icon: "check" as const, text: "Tap “Install”. Spal is now on your phone." }];

  async function add() {
    const r = await promptInstall();
    if (r === "accepted") { a2hsDone(); setMsg("Done! Look for Spal on your home screen."); setTimeout(onClose, 1400); }
    else if (r === "dismissed") setMsg("No problem. You can do it later from your profile.");
    else setMsg("Follow the steps below.");
  }

  return (
    <Sheet open={open} onClose={onClose} title="Put Spal on your phone">
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
        <img src="/icons/icon-192.png" alt="" width={64} height={64} style={{ borderRadius: 16, flex: "none" }} />
        <div>
          <h2 className="head" style={{ fontSize: 26, margin: 0 }}>Put Spal on your phone</h2>
          <p className="label" style={{ margin: "2px 0 0", fontSize: 16 }}>It opens like any app, and I can remind you about debts and closing time.</p>
        </div>
      </div>
      {inAppBrowser() && <p className="label" role="note" style={{ color: "var(--care-text)", fontSize: 16 }}>You opened Spal inside Facebook or Instagram. Open it in {ios ? "Safari" : "Chrome"} first, then follow these steps.</p>}
      {!ios && canPromptInstall() && <div style={{ margin: "12px 0" }}><Button block onClick={add}>Add Spal to my phone</Button></div>}
      {msg && <p className="label" role="status" style={{ fontSize: 16 }}>{msg}</p>}
      <ol className="a2hs-steps">
        {steps.map((s, i) => (
          <li key={i}><span className="a2hs-n">{i + 1}</span><span className="a2hs-ico"><Icon name={s.icon} size={26} /></span><span>{s.text}</span></li>
        ))}
      </ol>
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        <Button block onClick={() => { a2hsDone(); onClose(); }}>I added it</Button>
        <Button kind="ghost" block onClick={onClose}>Maybe later</Button>
      </div>
    </Sheet>
  );
}
