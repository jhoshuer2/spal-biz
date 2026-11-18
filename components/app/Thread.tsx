"use client";
import { useEffect, useRef } from "react";
import { Button, Icon } from "@/components/ui";
import type { Msg } from "@/lib/thread";

export type Live = { kind: "starting" | "listening" | "thinking"; title: string; sub?: string; skip?: boolean } | null;

/**
 * The conversation: Spal's lines on the left, hers on the right, results and questions as cards inside it.
 * Everything she can do here is a tap, because she may be standing at her counter.
 */
export function Thread({ msgs, live, lastResultId, greetWaiting, onUndo, onAnswer, onReplay, onFill, onSkip }: {
  msgs: Msg[]; live: Live; lastResultId: string | null; greetWaiting: boolean;
  onUndo: (m: Extract<Msg, { kind: "result" }>) => void; onAnswer: (m: Extract<Msg, { kind: "ask" }>, option: string) => void;
  onReplay: (text: string) => void; onFill: (text: string) => void; onSkip: () => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [msgs.length, live?.kind]);

  const hear = (text: string) => (
    <button className="replay" aria-label="Hear this again" onClick={() => onReplay(text)}><Icon name="speaker" size={18} /></button>
  );

  return (
    <div className="thread" role="log" aria-live="polite">
      {msgs.map((m) => {
        if (m.kind === "you") return <div key={m.id} className="bubble you">{m.via === "photo" ? "📷 " : ""}{m.text}</div>;
        if (m.kind === "spal") return (
          <div key={m.id} className="bubble spal">
            <span>{m.text}</span>
            <div className="bubble-actions">{hear(m.text)}{m.greet && greetWaiting && <Button small onClick={() => onReplay(m.text)}>Tap to hear Spal</Button>}</div>
          </div>
        );
        if (m.kind === "notice") return <div key={m.id} className="bubble spal soft">{m.text}</div>;
        if (m.kind === "result") return (
          <div key={m.id} className="bubble spal result">
            {m.undone ? <span className="label">Taken back.</span> : (
              <>
                <span className="label">{m.changed ? "Fixed" : "Got it"}</span>
                {m.heard && <span className="label heard">{m.photo ? "I read" : "I heard"}: “{m.heard.length > 180 ? m.heard.slice(0, 180) + "…" : m.heard}”</span>}
                {m.lines.map((l, i) => <span key={i} className="line">{l}</span>)}
                {m.id === lastResultId && (
                  <span className="bubble-actions">
                    <Button kind="ghost" small onClick={() => onUndo(m)}>Undo</Button>
                    <span className="label small">Something wrong? Just tell me.</span>
                  </span>
                )}
              </>
            )}
          </div>
        );
        if (m.kind === "ask") return (
          <div key={m.id} className="bubble spal">
            <span>{m.question}</span>
            {!m.answered && m.options.length > 0 && (
              <span className="choices">{m.options.map((o) => <button key={o} className="chip choice" onClick={() => onAnswer(m, o)}>{o}</button>)}</span>
            )}
            {!m.answered && m.options.length === 0 && <span className="label small">Tap the green button, or type, to answer.</span>}
            <div className="bubble-actions">{hear(m.question)}</div>
          </div>
        );
        if (m.kind === "tips") return (
          <div key={m.id} className="bubble spal">
            <span>You can say things like:</span>
            <span className="tips">{m.examples.map((e) => <button key={e} className="tip" onClick={() => onFill(e)}>{e}</button>)}</span>
            <span className="label small">Tap one to put it in the box and change it.</span>
          </div>
        );
        // summary: the day, kept
        return (
          <div key={m.id} className="summary">
            <p className="summary-title">{m.title}</p>
            <div className="summary-rows">{m.rows.map((r) => <div key={r.label} className="summary-row"><span>{r.label}</span><strong>{r.value}</strong></div>)}</div>
            <div className="week" aria-label={m.note}>{m.week.map((w, i) => <span key={i} className="day" data-on={w.on}><i>{w.on ? <Icon name="check" size={14} /> : null}</i>{w.d}</span>)}</div>
            <p className="label small" style={{ margin: "8px 0 0" }}>{m.note}</p>
          </div>
        );
      })}

      {live && (
        <div className="bubble spal live" role="status">
          <span className="live-title">{live.title}</span>
          {live.sub && <span className="label">{live.sub}</span>}
          {live.kind !== "starting" ? <span className="dots"><i /><i /><i /></span> : live.skip ? <Button kind="secondary" small onClick={onSkip}>Skip</Button> : null}
        </div>
      )}
      <div ref={end} />
    </div>
  );
}
