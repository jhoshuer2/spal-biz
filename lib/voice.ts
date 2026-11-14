"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { isNetworkError } from "./outbox";

export type MicFail = "denied" | "nomic" | "busy" | "unsupported" | "error";
/** What to tell her when the microphone could not start, in words she can act on. */
export function micMessage(r: MicFail) {
  if (r === "denied") return "The microphone is blocked for Spal. Tap the lock beside the web address, choose Permissions, and allow Microphone. Or just type it.";
  if (r === "nomic") return "This phone says it has no microphone. You can type it, or add a photo.";
  if (r === "busy") return "Another app is using the microphone. Close it and try again, or type it.";
  return "I couldn't start the microphone. You can type it, or add a photo.";
}

export type VoiceState = "idle" | "recording" | "transcribing";
export type VoiceResult = { text: string; blob: Blob } | { error: "denied" | "unsupported" | "empty" | "failed" | "limited" | "offline"; blob?: Blob };

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

  const lastError = useRef("");
  const start = useCallback(async (): Promise<"ok" | MicFail> => {
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
    } catch (e) {
      cleanup();
      const name = (e as { name?: string })?.name ?? "";
      lastError.current = `${name}: ${((e as { message?: string })?.message ?? "").slice(0, 120)}`;
      if (name === "NotAllowedError" || name === "SecurityError") return "denied";
      if (name === "NotFoundError" || name === "OverconstrainedError") return "nomic";
      if (name === "NotReadableError" || name === "AbortError") return "busy";
      return "error";
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
    const out = await transcribe(blob, await getToken().catch(() => ""));
    setState("idle");
    return out;
  }, [cleanup, getToken]);

  /** Stop and throw the recording away. */
  const cancel = useCallback(() => {
    const r = rec.current;
    rec.current = null;
    if (r && r.state === "recording") { r.onstop = null; r.stop(); }
    cleanup();
    setState("idle");
  }, [cleanup]);

  return { state, level, supported, start, finish, cancel, lastError };
}

/** Turn a recording into words. `offline` keeps the recording so it can be sent later. */
export async function transcribe(blob: Blob, token: string): Promise<VoiceResult> {
  try {
    const fd = new FormData();
    fd.append("audio", blob);
    const res = await fetch("/api/transcribe", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    if (res.status === 429) return { error: "limited" };
    const j = await res.json();
    if (!res.ok) return { error: "failed" };
    return j.text ? { text: j.text as string, blob } : { error: "empty" };
  } catch (e) {
    return isNetworkError(e) ? { error: "offline", blob } : { error: "failed" };
  }
}
