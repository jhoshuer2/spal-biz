"use client";
import { useEffect, useState } from "react";
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
  const mode = state === "listening" ? "listening" : talking ? "speaking" : state === "thinking" ? "thinking" : "idle";
  const label = mode === "listening" ? "Listening" : mode === "speaking" ? "Speaking" : mode === "thinking" ? "Thinking" : "Spal";

  return (
    <section className="face" data-mode={mode} style={{ ["--lv" as string]: String(Math.min(1, level)) }} aria-label="Spal">
      <img className="face-img" src="/spal/face.webp" alt="" width={960} height={540} decoding="async" />
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
