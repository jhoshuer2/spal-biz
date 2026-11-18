"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui";
import { SpalFace } from "./SpalFace";

const COLORS = ["#0e1116", "#ffffff", "#7a6bff", "#ff8fcf", "#38c8ff"];

/** The first sale in the book: a full lime moment with Spal's face, a little confetti, and one button. */
export function Celebration({ line, onDone }: { line: string; onDone: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onDone();
    window.addEventListener("keydown", h);
    try { navigator.vibrate?.([60, 40, 60]); } catch { /* not every phone */ }
    return () => window.removeEventListener("keydown", h);
  }, [onDone]);
  return (
    <div className="celebrate" role="dialog" aria-modal="true" aria-label="Your first sale is in the book">
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 36 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, background: COLORS[i % COLORS.length], animationDelay: `${(i % 9) * 0.12}s`, animationDuration: `${2.2 + (i % 5) * 0.35}s`, transform: `rotate(${(i * 47) % 360}deg)` }} />
        ))}
      </div>
      <div className="celebrate-face"><SpalFace size="compact" state="idle" level={0} evening={false} pills={[]} onPill={() => {}} status={false} /></div>
      <div className="celebrate-copy">
        <h1>Your first sale is in the book</h1>
        <p className="celebrate-line">{line}</p>
        <p className="celebrate-sub">That's how it starts. Tell me every sale, and I'll keep count.</p>
      </div>
      <div className="celebrate-cta"><Button block onClick={onDone}>Continue</Button></div>
    </div>
  );
}
