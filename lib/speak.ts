/**
 * Spal's voice. Real speech from the server (ElevenLabs, cached on the phone), with the phone's own voice as a backup
 * when the server can't help. It is on by default, because Spal is meant to be someone who talks to her; she can switch it
 * off in her profile. Browsers do not allow sound before the first tap, so a greeting that is blocked waits for her first touch.
 */
const SWITCH = "spal-speak"; // "off" when she turned the voice off
const NOTES = "spal-notes"; // how many notes she has sent
const INTRO = "spal-intro"; // how many times the how-to cue was spoken
const MIC = "spal-mic-ok";

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: fine */ } };
const num = (k: string) => Number(get(k)) || 0;

export const notesSent = () => num(NOTES);
export const bumpNotes = () => set(NOTES, String(num(NOTES) + 1));
export const isNewOwner = () => num(NOTES) < 5;
export const canSpeak = () => typeof window !== "undefined";
export const speakOn = () => canSpeak() && get(SWITCH) !== "off";
export const setSpeak = (on: boolean) => set(SWITCH, on ? "on" : "off");
export const micKnown = () => get(MIC) === "1";
export const rememberMic = () => set(MIC, "1");
export const INTRO_TEXT = "I'm listening. Tell me what happened, then tap the green button when you're done.";
/** What Spal says before it starts listening: the full how-to the first two times, a short cue for the next few, then nothing. */
export const cueFor = () => (num(INTRO) < 2 ? INTRO_TEXT : num(INTRO) < 8 ? "I'm listening." : null);
export const introDone = () => set(INTRO, String(num(INTRO) + 1));

/** "₦4,500" is read as "4,500 naira". */
export const say = (t: string) => t.replace(/₦\s?([\d,]+(?:\.\d+)?)/g, "$1 naira").replace(/\s+/g, " ").trim();

// ---- the engine ----
let getToken: (() => Promise<string>) | null = null;
let onProblem: ((what: string, ctx: Record<string, unknown>) => void) | null = null;
/** Give the voice what it needs to ask the server for speech, and where to report trouble. */
export function setupSpeech(token: () => Promise<string>, problem?: (what: string, ctx: Record<string, unknown>) => void) { getToken = token; onProblem = problem ?? null; }

const listeners = new Set<(on: boolean) => void>();
let speakingNow = false;
const setSpeaking = (on: boolean) => { if (on !== speakingNow) { speakingNow = on; listeners.forEach((f) => f(on)); } };
/** Know when Spal is talking, so its face can show it. Returns a way to stop listening. */
export function onSpeaking(f: (on: boolean) => void) { listeners.add(f); return () => { listeners.delete(f); }; }

// The face follows the voice: it shows the talking clip only while there is sound, and plays it at the pace of the speech.
const voicedL = new Set<(v: boolean) => void>();
const rateL = new Set<(r: number) => void>();
export const onVoiced = (f: (v: boolean) => void) => { voicedL.add(f); return () => { voicedL.delete(f); }; };
export const onRate = (f: (r: number) => void) => { rateL.add(f); return () => { rateL.delete(f); }; };
type Env = { env: Uint8Array; fps: number };
const envs = new Map<string, Promise<Env | null>>();
/** How loud the voice is, 25 times a second, worked out from the audio file before it plays (never touches the playing sound). */
function envelope(key: string, getBlob: () => Promise<Blob>): Promise<Env | null> {
  const hit = envs.get(key);
  if (hit) return hit;
  const p = (async () => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const buf = await ctx.decodeAudioData(await (await getBlob()).arrayBuffer());
      ctx.close().catch(() => {});
      const ch = buf.getChannelData(0), fps = 25, step = Math.max(1, Math.floor(buf.sampleRate / fps)), n = Math.ceil(ch.length / step);
      const rms = new Float32Array(n);
      let max = 0;
      for (let i = 0; i < n; i++) { let sum = 0; const a = i * step, b = Math.min(ch.length, a + step); for (let j = a; j < b; j++) sum += ch[j] * ch[j]; rms[i] = Math.sqrt(sum / Math.max(1, b - a)); if (rms[i] > max) max = rms[i]; }
      const env = new Uint8Array(n);
      for (let i = 0; i < n; i++) env[i] = max ? Math.round((255 * rms[i]) / max) : 0;
      return { env, fps };
    } catch { return null; }
  })();
  envs.set(key, p);
  return p;
}

let serverOk = true; // switched off for the rest of the visit if the server cannot do speech
let reported = false;
let gen = 0; // every new line of speech cancels the older one
let audio: HTMLAudioElement | null = null;
const urls = new Map<string, string>();
const el = () => (audio ??= new Audio());
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=";

/** Phones only allow sound after a tap. Call this inside the tap, so later speech is allowed. */
export function unlockSpeech() {
  if (!canSpeak()) return;
  try { const a = el(); a.src = SILENT; a.play().catch(() => {}); } catch { /* ignore */ }
  try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; window.speechSynthesis?.speak(u); } catch { /* ignore */ }
}

/** Where the voice is right now, in seconds, so a video can stay in step with it. */
export const speechClock = () => (audio && !audio.paused ? audio.currentTime : 0);

export function stopSpeaking() {
  gen++;
  setSpeaking(false);
  try { audio?.pause(); } catch { /* ignore */ }
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}

async function ttsUrl(text: string): Promise<string> {
  const mem = urls.get(text);
  if (mem) return mem;
  const key = `/voice?t=${encodeURIComponent(text)}`;
  const cache = typeof caches !== "undefined" ? await caches.open("spal-voice").catch(() => null) : null;
  const hit = cache ? await cache.match(key).catch(() => undefined) : undefined;
  let blob: Blob;
  if (hit) blob = await hit.blob();
  else {
    const token = (await getToken?.().catch(() => "")) ?? "";
    const r = await fetch("/api/speak", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ text }) });
    if (!r.ok) { const e = new Error(`tts ${r.status}`); (e as Error & { status?: number }).status = r.status; throw e; }
    blob = await r.blob();
    if (text.length <= 140 && cache) cache.put(key, new Response(blob, { headers: { "Content-Type": "audio/mpeg" } })).catch(() => {});
  }
  const url = URL.createObjectURL(blob);
  urls.set(text, url);
  envelope(url, async () => blob);
  return url;
}

const SPEECH_WPS = 3.2; // the pace of the talking clip, in words a second

function play(url: string, mine: number, words = 0): Promise<boolean> {
  return new Promise((resolve) => {
    const a = el();
    let done = false, raf = 0;
    const end = (ok: boolean) => { if (done) return; done = true; cancelAnimationFrame(raf); setSpeaking(false); clearTimeout(timer); a.removeEventListener("ended", onEnd); a.removeEventListener("pause", onEnd); a.removeEventListener("error", onErr); resolve(ok); };
    const onEnd = () => end(true);
    const onErr = () => end(false);
    const timer = setTimeout(() => end(true), 25_000);
    a.addEventListener("ended", onEnd); a.addEventListener("pause", onEnd); a.addEventListener("error", onErr);
    a.src = url;
    if (mine !== gen) return end(false);
    const started = (async () => {
      // the loudness map is ready almost at once; do not hold the voice for it more than a moment
      const e = await Promise.race([envs.get(url) ?? envelope(url, async () => (await fetch(url)).blob()), new Promise<null>((r) => setTimeout(() => r(null), 350))]);
      return e;
    })();
    started.then((e) => {
      if (done || mine !== gen) return;
      a.play().then(() => {
        if (done) return;
        setSpeaking(true);
        const dur = isFinite(a.duration) ? a.duration : 0;
        rateL.forEach((f) => f(words && dur > 1 ? Math.min(1.3, Math.max(0.8, words / Math.max(0.5, dur - 0.4) / SPEECH_WPS)) : 1));
        if (!e) { voicedL.forEach((f) => f(true)); return; }
        let hold = 0, last = true;
        const tick = () => {
          if (done) return;
          const i = Math.floor(a.currentTime * e.fps);
          if ((e.env[i] ?? 0) > 28 || (e.env[i + 1] ?? 0) > 28 || (e.env[i - 1] ?? 0) > 28) hold = performance.now() + 140; // short gaps between words stay "talking"
          const on = performance.now() < hold;
          if (on !== last) { last = on; voicedL.forEach((f) => f(on)); }
          raf = requestAnimationFrame(tick);
        };
        tick();
      }).catch(() => end(false)); // blocked until her first tap: the caller decides what to do
    });
  });
}

function phoneVoice(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return resolve(false);
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = synth.getVoices();
      const voice = v.find((x) => x.lang.replace("_", "-").toLowerCase() === "en-ng") ?? v.find((x) => /^en[-_]gb/i.test(x.lang)) ?? v.find((x) => /^en/i.test(x.lang)) ?? null;
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "en-GB";
      u.rate = 0.95;
      let started = false, done = false;
      const end = () => { if (!done) { done = true; setSpeaking(false); clearTimeout(timer); resolve(started); } };
      const timer = setTimeout(end, Math.min(12_000, 2500 + text.length * 85));
      u.onstart = () => { started = true; setSpeaking(true); voicedL.forEach((f) => f(true)); rateL.forEach((f) => f(1)); }; u.onend = end; u.onerror = end;
      setTimeout(() => { try { synth.resume(); synth.speak(u); } catch { end(); } }, 80);
    } catch { resolve(false); }
  });
}

/** Say it. Resolves true if it was really spoken, false if it stayed silent (blocked until a tap, muted, or replaced by newer speech). */
export async function speak(text: string): Promise<boolean> {
  if (!canSpeak()) return false;
  const s = say(text);
  if (!s) return false;
  stopSpeaking();
  const mine = gen;
  if (serverOk && getToken) {
    try {
      const url = await ttsUrl(s);
      if (mine !== gen) return false;
      return await play(url, mine, s.split(/\s+/).length);
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (status === 429) return phoneVoice(s);
      serverOk = false; // do not keep asking a server that cannot do it; the phone's own voice carries on
      if (!reported) { reported = true; onProblem?.("Spoken voice from the server failed", { status: status ?? null, message: e instanceof Error ? e.message : String(e) }); }
    }
  }
  if (mine !== gen) return false;
  return phoneVoice(s);
}

/** Play a recorded line that ships with the app (used before she has an account, when the server voice is not available). */
export async function playLine(src: string, text = ""): Promise<boolean> {
  if (!canSpeak() || !speakOn()) return false;
  stopSpeaking();
  const mine = gen;
  return play(src, mine, text ? text.split(/\s+/).length : 0);
}

/** Speak now; if the phone blocks sound until she touches it, say so through `waiting` and speak on her first touch (unless she is pressing the talk button, which speaks for itself). */
export function speakWhenAllowed(text: string, waiting?: (w: boolean) => void) {
  speak(text).then((ok) => {
    if (ok) return;
    waiting?.(true);
    const once = (e: Event) => {
      window.removeEventListener("pointerdown", once, true);
      const t = e.target as Element | null;
      if (t?.closest?.(".talk, .tabbar, input, textarea")) { waiting?.(false); return; } // she is already acting; do not talk over her
      unlockSpeech();
      speak(text).then(() => waiting?.(false));
    };
    window.addEventListener("pointerdown", once, true);
  });
}
export const isIOS = () => typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

/** What Spal says when the answer arrives: short, because "Got it" was already said the moment she tapped. */
export function replyToSay(r: { question: string | null; lines: string[]; status: string; changed?: boolean }) {
  if (r.status === "failed") return "I kept your note, but I couldn't read it just now.";
  if (r.question) return r.question;
  if (!r.lines.length) return "";
  return `${r.changed ? "Fixed. " : ""}${r.lines[0]}`;
}
