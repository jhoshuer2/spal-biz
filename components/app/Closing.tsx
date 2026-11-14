"use client";
import { useEffect, useState } from "react";
import { Button, DeltaPill, Icon, Orb, Roll, Surface, TextField } from "@/components/ui";
import { naira } from "@/lib/format";
import { closingCase, countOf, salesOf, summarize, type DayEvent, type Summary } from "@/lib/day";
import { sendNote, undoNote, type Reply } from "@/lib/capture";
import { micMessage, useVoice } from "@/lib/voice";
import type { SupabaseClient } from "@supabase/supabase-js";

type Props = {
  sb: SupabaseClient; getToken: () => Promise<string>; shopId: string; ownerFirst: string;
  today: DayEvent[]; recent: DayEvent[]; todayKey: string;
  itemNames: Map<string, string>; owing: { name: string; kobo: number }[];
  refresh: () => Promise<void>;
  onOffline: (text: string | undefined, blob: Blob | undefined, context: string | undefined) => void;
  onClose: () => void; onClosed: (s: Summary) => void;
};

/** Spal speaks first, fits the question to the day she had, then gives the summary. */
export function Closing({ sb, getToken, shopId, ownerFirst, today, recent, todayKey, itemNames, owing, refresh, onOffline, onClose, onClosed }: Props) {
  const [step, setStep] = useState<"ask" | "summary">("ask");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Reply[]>([]);
  const [question, setQuestion] = useState<Reply | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Make sure the first question is based on everything she has told me.
  const [ready, setReady] = useState(false);
  useEffect(() => { refresh().finally(() => setReady(true)); }, [refresh]);

  const voice = useVoice(getToken);

  const kind = closingCase(today, recent, todayKey);
  const n = countOf(today);
  const total = salesOf(today);

  const head =
    kind === "nothing" ? "How was today?"
    : kind === "some" ? `I have ${n} ${n === 1 ? "sale" : "sales"}, ${naira(total)} so far. Anything I missed?`
    : `${n} ${n === 1 ? "sale" : "sales"}, ${naira(total)}. Does that sound right?`;
  const sub = kind === "nothing" ? "Tell me what you sold, what you spent, or who owes you." : null;

  async function onMic() {
    setErr(null);
    if (voice.state === "recording") {
      setBusy(true);
      const r = await voice.finish();
      setBusy(false);
      if ("error" in r && r.error === "offline" && r.blob) { onOffline(undefined, r.blob, undefined); setErr("No signal. I've saved your recording and will read it when you're back online."); return; }
      if ("error" in r) { setErr(r.error === "empty" ? "I didn't hear anything. Try again." : r.error === "limited" ? "That's a lot of talking for one day. You can still type to me." : "I couldn't hear that. You can type it instead."); return; }
      await submit(r.text, r.blob);
      return;
    }
    if (voice.state !== "idle") return;
    const r = await voice.start();
    if (r !== "ok") setErr(micMessage(r));
  }

  async function submit(text?: string, voiceBlob?: Blob) {
    const t = (text ?? note).trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    const ctx = question ? `${question.note} | Spal asked: ${question.question}` : undefined;
    const { reply, keepFailed, offline } = await sendNote(sb, shopId, t, ctx, voiceBlob ? { blob: voiceBlob } : undefined);
    setBusy(false);
    if (offline || reply?.offline) { onOffline(t, voiceBlob, ctx); setNote(""); setErr("No signal. I've saved that on your phone and will read it when you're back online."); return; }
    if (keepFailed || !reply) { setErr("I couldn't keep that. Please try again."); return; }
    setNote("");
    if (reply.status === "failed") { setErr(reply.limited ? "That's a lot for one day. I've kept your note and we'll carry on tomorrow." : "I kept your note, but couldn't read it just now."); return; }
    if (reply.lines.length === 0 && reply.question) { setQuestion(reply); return; }
    setQuestion(reply.question ? reply : null);
    setAdded((a) => [...a, reply]);
    await refresh();
  }

  async function undo(r: Reply) {
    await undoNote(sb, r.captureId);
    setAdded((a) => a.filter((x) => x.captureId !== r.captureId));
    await refresh();
  }

  const summary = summarize(today, recent, itemNames, owing);

  return (
    <div data-mood="evening" className="on-mood" style={{ position: "fixed", inset: 0, zIndex: 50, overflowY: "auto", background: "var(--mood-from)" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 20px 32px", minHeight: "100%", display: "flex", flexDirection: "column" }}>
        <div><button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button></div>
        <div style={{ display: "grid", placeItems: "center", padding: "8px 0" }}>
          <Orb tone="indigo" size={step === "ask" ? 150 : 110} state={busy || !ready ? "thinking" : "idle"} />
        </div>

        {!ready ? (
          <p className="label" style={{ margin: "24px 0", fontSize: 20, textAlign: "center" }}>One moment</p>
        ) : step === "ask" ? (
          <>
            <h1 className="head" style={{ fontSize: 34, margin: "12px 0 8px" }}>{head}</h1>
            {sub && <p className="label" style={{ margin: "0 0 12px", fontSize: 17 }}>{sub}</p>}

            {added.map((r) => (
              <Surface key={r.captureId} className="" >
                <p className="label" style={{ margin: 0 }}>{r.changed ? "Fixed" : "Got it"}</p>
                {r.heard && <p className="label" style={{ margin: "4px 0 0", fontStyle: "italic" }}>I heard: “{r.heard}”</p>}
                {r.lines.map((l, i) => <p key={i} style={{ margin: "6px 0 0", fontSize: 18, fontWeight: 500 }}>{l}</p>)}
                <div style={{ marginTop: 8 }}><Button kind="ghost" small onClick={() => undo(r)} style={{ color: "var(--ink-2)" }}>Not right? Undo</Button></div>
              </Surface>
            ))}
            {question && <Surface><p style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>{question.question}</p></Surface>}

            <div style={{ marginTop: 16 }}>
              <TextField value={note} onChange={setNote} onSubmit={() => submit()} onMic={voice.supported ? onMic : undefined} micActive={voice.state === "recording"} placeholder={question ? "Type your answer" : kind === "nothing" && !added.length ? "Sold rice, ₦4,500, spent 3k on fuel" : "Add something I missed"} />
              {voice.state === "recording" && <p className="label" style={{ margin: "10px 4px 0" }}>Listening. Tap the mic when you're done.</p>}
              {err && <p role="alert" style={{ margin: "10px 4px 0", color: "#ffb38a" }}>{err}</p>}
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: "grid", gap: 8, marginTop: 24 }}>
              {note.trim() ? (
                <Button block onClick={() => submit()} disabled={busy}>{busy ? "One moment" : "Add it"}</Button>
              ) : (
                <Button block onClick={() => setStep("summary")}>
                  {kind === "everything" || added.length > 0 ? "Yes, that's everything" : kind === "some" ? "That's everything" : "Nothing today"}
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            {summary.total > 0 ? (
              <>
                <p className="label" style={{ margin: "12px 0 0", fontSize: 17 }}>{summary.count > 0 ? "Today you made" : "Today, about"}</p>
                <div className="num" style={{ fontSize: 72, margin: "6px 0 14px", color: "var(--mood-ink)" }}><Roll prefix="₦" value={Math.round(summary.total / 100)} /></div>
              </>
            ) : (
              <h1 className="head" style={{ fontSize: 44, margin: "12px 0 16px" }}>A quiet day</h1>
            )}
            {summary.delta && (
              <div style={{ marginBottom: 16 }}>
                <DeltaPill tone={summary.delta.diff > 0 ? "good" : "flat"}>
                  {naira(Math.abs(summary.delta.diff))} {summary.delta.diff > 0 ? "more" : "less"} than last {summary.delta.weekday}
                </DeltaPill>
              </div>
            )}
            <Surface>
              <div style={{ display: "grid", gap: 10, fontSize: 18 }}>
                {summary.count > 0 && <div>From {summary.count} {summary.count === 1 ? "sale" : "sales"}.</div>}
                {summary.spent > 0 && <div>You spent {naira(summary.spent)}.</div>}
                {summary.best && <div>{summary.best[0].toUpperCase() + summary.best.slice(1)} sold the most.</div>}
                {summary.owing.slice(0, 2).map((o) => <div key={o.name}>{o.name} owes {naira(o.kobo)}.</div>)}
                {summary.count === 0 && summary.spent === 0 && summary.owing.length === 0 && <div>A quiet day. Tomorrow is a new one, {ownerFirst}.</div>}
              </div>
            </Surface>
            <div style={{ flex: 1 }} />
            <div style={{ display: "grid", gap: 8, marginTop: 24 }}>
              <Button block onClick={() => onClosed(summary)}>Done for today</Button>
              <Button kind="ghost" block onClick={() => setStep("ask")}>I missed something</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
