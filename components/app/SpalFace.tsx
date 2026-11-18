"use client";
import { useEffect, useRef, useState } from "react";
import { Aura } from "@/components/ui";
import { onRate, onSpeaking, onVoiced, speechClock } from "@/lib/speak";

export type FaceState = "idle" | "listening" | "thinking";
export type Pill = { id: string; label: string; value: string };

/**
 * Spal's face, with the conversation below it. The face breathes when idle, glows with her voice while she speaks,
 * and shows when Spal is thinking or talking. The day's three numbers sit on the face as taps.
 */
export function SpalFace({ state, level, evening, pills, onPill, header, talkingOverride, size = "normal", status = true, lip }: {
  state: FaceState; level: number; evening: boolean; pills: Pill[]; onPill: (id: string) => void; header?: React.ReactNode; talkingOverride?: boolean; size?: "hero" | "normal" | "compact"; status?: boolean; lip?: string;
}) {
  const [heardTalking, setTalking] = useState(false);
  useEffect(() => onSpeaking(setTalking), []);
  const talking = talkingOverride ?? heardTalking;
  // A clip made for exactly this line: while the line plays, it is the face, and it is kept in step with the voice.
  const lipEl = useRef<HTMLVideoElement>(null);
  const [lipReady, setLipReady] = useState(false);
  useEffect(() => {
    const v = lipEl.current;
    if (!v || !lip) return;
    setLipReady(false);
    v.src = lip; v.load();
  }, [lip]);
  useEffect(() => {
    const v = lipEl.current;
    if (!v || !lip || !lipReady) return;
    if (!talking) { v.pause(); try { v.currentTime = 0; } catch { /* not loaded yet */ } return; }
    try { v.currentTime = speechClock(); } catch { /* not loaded yet */ }
    v.play().catch(() => {});
    const h = setInterval(() => { const t = speechClock(); if (t > 0 && Math.abs(v.currentTime - t) > 0.12) { try { v.currentTime = t; } catch { /* ignore */ } } }, 250);
    return () => clearInterval(h);
  }, [talking, lip, lipReady]);
  const [voiced, setVoiced] = useState(true);
  useEffect(() => onVoiced(setVoiced), []);
  useEffect(() => onRate((r) => { if (video.current) video.current.playbackRate = r; }), []);
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
    <section className="face" data-size={size} data-mode={mode} style={{ ["--lv" as string]: String(Math.min(1, level)) }} aria-label="Spal">
      <img className="face-img" src="/spal/face.webp" alt="" width={960} height={540} decoding="async" />
      {lip && <video ref={lipEl} className="face-video" data-on={talking && lipReady} muted playsInline preload="auto" aria-hidden="true" onCanPlay={() => setLipReady(true)} onError={() => setLipReady(false)} />}
      <video ref={video} className="face-video" data-on={!(lip && lipReady) && talking && voiced && ready} muted loop playsInline preload="none" aria-hidden="true" onCanPlay={() => setReady(true)} />
      <div className="face-aura"><Aura tone={evening ? "indigo" : "lilac"} state={state} level={level} /></div>
      {header && <div className="face-top">{header}</div>}
      {status && <div className="face-status" role="status"><i />{label}</div>}
      {pills.length > 0 && (
        <div className="face-pills">
          {pills.map((p) => <button key={p.id} className="face-pill" onClick={() => onPill(p.id)}><span>{p.label}</span><strong>{p.value}</strong></button>)}
        </div>
      )}
    </section>
  );
}
