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

export function stopSpeaking() {
  gen++;
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
  return url;
}

function play(url: string, mine: number): Promise<boolean> {
  return new Promise((resolve) => {
    const a = el();
    let done = false;
    const end = (ok: boolean) => { if (done) return; done = true; clearTimeout(timer); a.removeEventListener("ended", onEnd); a.removeEventListener("pause", onEnd); a.removeEventListener("error", onErr); resolve(ok); };
    const onEnd = () => end(true);
    const onErr = () => end(false);
    const timer = setTimeout(() => end(true), 25_000);
    a.addEventListener("ended", onEnd); a.addEventListener("pause", onEnd); a.addEventListener("error", onErr);
    a.src = url;
    if (mine !== gen) return end(false);
    a.play().catch(() => end(false)); // blocked until her first tap: the caller decides what to do
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
      const end = () => { if (!done) { done = true; clearTimeout(timer); resolve(started); } };
      const timer = setTimeout(end, Math.min(12_000, 2500 + text.length * 85));
      u.onstart = () => { started = true; }; u.onend = end; u.onerror = end;
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
      return await play(url, mine);
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

/** Speak now; if the phone blocks sound until she touches it, speak on her first touch (unless she is already doing something). */
export function speakWhenAllowed(text: string) {
  speak(text).then((ok) => {
    if (ok) return;
    const once = (e: Event) => {
      window.removeEventListener("pointerdown", once, true);
      const t = e.target as Element | null;
      if (t?.closest?.(".talk, .tabbar, input, textarea")) return; // she is already acting; do not talk over her
      unlockSpeech();
      speak(text);
    };
    window.addEventListener("pointerdown", once, true);
  });
}

/** What Spal says when the answer arrives: short, because "Got it" was already said the moment she tapped. */
export function replyToSay(r: { question: string | null; lines: string[]; status: string; changed?: boolean }) {
  if (r.status === "failed") return "I kept your note, but I couldn't read it just now.";
  if (r.question) return r.question;
  if (!r.lines.length) return "";
  return `${r.changed ? "Fixed. " : ""}${r.lines[0]}`;
}
