"use client";
import { useEffect, useRef, useState } from "react";
import { Aura } from "@/components/ui";
import { onSpeaking } from "@/lib/speak";

export type FaceState = "idle" | "listening" | "thinking";
export type Pill = { id: string; label: string; value: string };

/**
 * Spal's face, with the conversation below it. The face breathes when idle, glows with her voice while she speaks,
 * and shows when Spal is thinking or talking. The day's three numbers sit on the face as taps.
 */
export function SpalFace({ state, level, evening, pills, onPill, header }: {
  state: FaceState; level: number; evening: boolean; pills: Pill[]; onPill: (id: string) => void; header: React.ReactNode;
}) {
  const [talking, setTalking] = useState(false);
  useEffect(() => onSpeaking(setTalking), []);
  // The talking clip is fetched once the screen has settled, so it never competes with the first paint on a slow phone.
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const load = () => { v.src = "/spal/talk.mp4"; v.load(); };
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback;
    const h = idle ? idle(load) : window.setTimeout(load, 2500);
    return () => { if (!idle) clearTimeout(h); };
  }, []);
  useEffect(() => {
    const v = video.current;
    if (!v || !ready) return;
    if (talking) { v.play().catch(() => {}); }
    else { v.pause(); }
  }, [talking, ready]);
  const mode = state === "listening" ? "listening" : talking ? "speaking" : state === "thinking" ? "thinking" : "idle";
  const label = mode === "listening" ? "Listening" : mode === "speaking" ? "Speaking" : mode === "thinking" ? "Thinking" : "Spal";

  return (
    <section className="face" data-mode={mode} style={{ ["--lv" as string]: String(Math.min(1, level)) }} aria-label="Spal">
      <img className="face-img" src="/spal/face.webp" alt="" width={960} height={540} decoding="async" />
      <video ref={video} className="face-video" data-on={talking && ready} muted loop playsInline preload="none" aria-hidden="true" onCanPlay={() => setReady(true)} />
      <div className="face-aura"><Aura tone={evening ? "indigo" : "lilac"} state={state} level={level} /></div>
      <div className="face-top">{header}</div>
      <div className="face-status" role="status"><i />{label}</div>
      {pills.length > 0 && (
        <div className="face-pills">
          {pills.map((p) => <button key={p.id} className="face-pill" onClick={() => onPill(p.id)}><span>{p.label}</span><strong>{p.value}</strong></button>)}
        </div>
      )}
    </section>
  );
}
