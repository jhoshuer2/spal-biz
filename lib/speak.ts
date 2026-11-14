/**
 * Spal's spoken voice for new owners. Uses the phone's own voice: free, instant, works offline.
 * It is only for the beginning: a new owner hears how it works and hears answers read back;
 * after enough notes it goes quiet by itself, and she can switch it on or off in her profile.
 */
const SWITCH = "spal-speak"; // "on" | "off" | missing (Spal decides)
const NOTES = "spal-notes"; // how many notes she has sent
const INTRO = "spal-intro"; // how many times the how-to was spoken
const MIC = "spal-mic-ok";
export const NEW_FOR = 15; // notes, then Spal goes quiet unless she asked for it
const INTRO_TIMES = 3;

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: fine */ } };
const num = (k: string) => Number(get(k)) || 0;

export const notesSent = () => num(NOTES);
export const bumpNotes = () => set(NOTES, String(num(NOTES) + 1));
export const isNewOwner = () => num(NOTES) < 5;
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;
export function speakOn() {
  const s = get(SWITCH);
  if (s === "on") return canSpeak();
  if (s === "off") return false;
  return canSpeak() && num(NOTES) < NEW_FOR;
}
export const setSpeak = (on: boolean) => set(SWITCH, on ? "on" : "off");
export const micKnown = () => get(MIC) === "1";
export const rememberMic = () => set(MIC, "1");
export const introDue = () => num(INTRO) < INTRO_TIMES;
export const introDone = () => set(INTRO, String(num(INTRO) + 1));

/** Some phones refuse speech until it has been started from a tap. Call this inside the tap. */
export function unlockSpeech() {
  if (!canSpeak()) return;
  try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; window.speechSynthesis.speak(u); } catch { /* ignore */ }
}

/** "₦4,500" is read as "4,500 naira". */
const say = (t: string) => t.replace(/₦\s?([\d,]+(?:\.\d+)?)/g, "$1 naira").replace(/\s+/g, " ").trim();

function pickVoice() {
  const v = window.speechSynthesis.getVoices();
  return v.find((x) => x.lang.replace("_", "-").toLowerCase() === "en-ng") ?? v.find((x) => /^en[-_]gb/i.test(x.lang)) ?? v.find((x) => /^en/i.test(x.lang)) ?? null;
}

export function stopSpeaking() { if (canSpeak()) try { window.speechSynthesis.cancel(); } catch { /* ignore */ } }

/** Say it. Resolves true if the phone really started speaking, false if it stayed silent (blocked, muted, no voice). */
export function speak(text: string): Promise<boolean> {
  if (!canSpeak()) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const s = say(text);
      const u = new SpeechSynthesisUtterance(s);
      const voice = pickVoice();
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "en-GB";
      u.rate = 0.95;
      let started = false, done = false;
      const end = () => { if (!done) { done = true; clearTimeout(timer); resolve(started); } };
      const timer = setTimeout(end, Math.min(12_000, 2500 + s.length * 85));
      u.onstart = () => { started = true; };
      u.onend = end; u.onerror = end;
      // a short pause after cancel(), and resume(), because some phones drop speech started in the same breath
      setTimeout(() => { try { synth.resume(); synth.speak(u); } catch { end(); } }, 80);
    } catch { resolve(false); }
  });
}

/** What Spal says when the answer arrives: short, because "Got it" was already said the moment she tapped. */
export function replyToSay(r: { question: string | null; lines: string[]; status: string; changed?: boolean }) {
  if (r.status === "failed") return "I kept your note, but I couldn't read it just now.";
  if (r.question) return r.question;
  if (!r.lines.length) return "";
  return `${r.changed ? "Fixed. " : ""}${r.lines[0]}`;
}
export const INTRO_TEXT = "I'm listening. Tell me what happened, then tap the green button when you're done.";
