"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceState = "idle" | "recording" | "transcribing";
export type VoiceResult = { text: string; blob: Blob } | { error: "denied" | "unsupported" | "empty" | "failed" };

const MAX_MS = 60_000;
const MIN_MS = 700;

function pickMime() {
  const c = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];
  return c.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
}

/** Record one spoken note, follow its loudness (for the orb), then turn it into text. */
export function useVoice(getToken: () => Promise<string>) {
  const [state, setState] = useState<VoiceState>("idle");
  const [level, setLevel] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const started = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  const cleanup = useCallback(() => {
    cancelAnimationFrame(raf.current);
    clearTimeout(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    ctx.current?.close().catch(() => {});
    ctx.current = null;
    setLevel(0);
  }, []);
  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async (): Promise<"ok" | "denied" | "unsupported"> => {
    if (!supported) return "unsupported";
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const mime = pickMime();
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.start();
      rec.current = r;
      started.current = Date.now();

      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AC();
      ctx.current = ac;
      const an = ac.createAnalyser();
      an.fftSize = 512;
      ac.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      let n = 0;
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        if (++n % 3 === 0) setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
      timer.current = setTimeout(() => { rec.current?.state === "recording" && rec.current.stop(); }, MAX_MS);
      setState("recording");
      return "ok";
    } catch {
      cleanup();
      return "denied";
    }
  }, [supported, cleanup]);

  /** Stop recording and return her words. */
  const finish = useCallback(async (): Promise<VoiceResult> => {
    const r = rec.current;
    if (!r) return { error: "failed" };
    const blob: Blob = await new Promise((resolve) => {
      r.onstop = () => resolve(new Blob(chunks.current, { type: r.mimeType || "audio/webm" }));
      r.state === "recording" ? r.stop() : resolve(new Blob(chunks.current, { type: r.mimeType || "audio/webm" }));
    });
    const ms = Date.now() - started.current;
    rec.current = null;
    cleanup();
    if (ms < MIN_MS || blob.size < 1000) { setState("idle"); return { error: "empty" }; }
    setState("transcribing");
    try {
      const fd = new FormData();
      fd.append("audio", blob);
      const res = await fetch("/api/transcribe", { method: "POST", headers: { Authorization: `Bearer ${await getToken()}` }, body: fd });
      const j = await res.json();
      setState("idle");
      if (!res.ok) return { error: "failed" };
      return j.text ? { text: j.text as string, blob } : { error: "empty" };
    } catch {
      setState("idle");
      return { error: "failed" };
    }
  }, [cleanup, getToken]);

  /** Stop and throw the recording away. */
  const cancel = useCallback(() => {
    const r = rec.current;
    rec.current = null;
    if (r && r.state === "recording") { r.onstop = null; r.stop(); }
    cleanup();
    setState("idle");
  }, [cleanup]);

  return { state, level, supported, start, finish, cancel };
}
