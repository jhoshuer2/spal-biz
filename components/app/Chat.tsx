"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Sheet, TextField } from "@/components/ui";
import { setSpeak, speak, speakOn, stopSpeaking, unlockSpeech } from "@/lib/speak";
import { useVoice } from "@/lib/voice";

type Msg = { role: "user" | "assistant"; content: string };
const STARTERS = ["How is business today?", "Who owes me money?", "How do I record a sale?"];

/**
 * Just talking with Spal. Nothing is recorded or changed here: ask about the shop, ask how to use the app, or chat.
 * Type or speak; Spal answers in writing and, if her voice is on, out loud.
 */
export function Chat({ open, onClose, getToken, first }: { open: boolean; onClose: () => void; getToken: () => Promise<string>; first: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const voice = useVoice(getToken);
  const end = useRef<HTMLDivElement>(null);
  const live = useRef(msgs);
  live.current = msgs;

  useEffect(() => { if (open) { setVoiceOn(speakOn()); setNote(null); } else { stopSpeaking(); voice.cancel(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [msgs, busy]);

  async function ask(q: string) {
    const t = q.trim();
    if (!t || busy) return;
    stopSpeaking(); unlockSpeech();
    const next: Msg[] = [...live.current, { role: "user", content: t }];
    setMsgs(next); setText(""); setBusy(true); setNote(null);
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` }, body: JSON.stringify({ messages: next }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 429) { setMsgs([...next, { role: "assistant", content: "We've talked a lot today! I'll be fresh again tomorrow. You can still record your sales with the green button." }]); }
      else if (!r.ok || !j.reply) throw new Error("chat");
      else { setMsgs([...next, { role: "assistant", content: j.reply }]); if (voiceOn) speak(j.reply); }
    } catch {
      setMsgs([...next, { role: "assistant", content: navigator.onLine === false ? "I need signal to chat. Try again when you're back online." : "I couldn't answer just now. Please try again." }]);
    }
    setBusy(false);
  }

  async function mic() {
    if (voice.state === "recording") {
      const r = await voice.finish();
      if ("error" in r) { setNote(r.error === "empty" ? "I didn't hear anything. Tap the microphone and speak." : "I couldn't hear that. You can type it."); return; }
      return ask(r.text);
    }
    stopSpeaking(); unlockSpeech(); setNote(null);
    const r = await voice.start();
    if (r !== "ok") setNote("I can't use the microphone. You can type instead.");
  }

  const listening = voice.state === "recording";
  return (
    <Sheet open={open} onClose={onClose} title="Chat with Spal">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <h2 className="head" style={{ fontSize: 26, margin: 0 }}>Chat with Spal</h2>
        <Button kind="secondary" small onClick={() => { const v = !voiceOn; setVoiceOn(v); setSpeak(v); if (!v) stopSpeaking(); }}>{voiceOn ? "Voice on" : "Voice off"}</Button>
      </div>
      <p className="label" style={{ margin: "0 0 12px", fontSize: 16 }}>Just talking. Nothing here is saved to your book.</p>

      <div className="chat-log" role="log" aria-live="polite">
        <div className="bubble spal">Hi {first}. Ask me anything about your shop, or how to use Spal. We can also just chat.</div>
        {msgs.length === 0 && <div className="chat-starters">{STARTERS.map((s) => <button key={s} className="chip choice" onClick={() => ask(s)}>{s}</button>)}</div>}
        {msgs.map((m, i) => <div key={i} className={`bubble ${m.role === "user" ? "you" : "spal"}`}>{m.content}</div>)}
        {busy && <div className="bubble spal" aria-label="Spal is thinking"><span className="dots"><i /><i /><i /></span></div>}
        <div ref={end} />
      </div>

      {(listening || note) && <p className="label" role="status" style={{ margin: "8px 4px 0", fontSize: 16, color: note && !listening ? "var(--care-text)" : undefined }}>{listening ? "I'm listening. Tap the microphone when you're done." : note}</p>}
      <div style={{ marginTop: 10 }}>
        <TextField value={text} onChange={setText} onSubmit={() => ask(text)} placeholder="Ask Spal anything" name="chat"
          onMic={voice.supported ? mic : undefined} micActive={listening} />
      </div>
    </Sheet>
  );
}
