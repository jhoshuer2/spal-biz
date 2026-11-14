"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";
export { Icon } from "./Icon";
export { Orb } from "./Orb";
export { Aura } from "./Aura";
export { Logo } from "./Logo";
export { Roll } from "./Roll";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "secondary" | "ghost"; block?: boolean; small?: boolean };
export function Button({ kind = "primary", block, small, className = "", ...p }: BtnProps) {
  return <button {...p} className={`btn btn-${kind} ${block ? "btn-block" : ""} ${small ? "btn-sm" : ""} ${className}`} />;
}

export function Surface({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`surface ${className}`}>{children}</div>;
}

export function Chip({ children, pressed, onClick }: { children: React.ReactNode; pressed?: boolean; onClick?: () => void }) {
  return <button className="chip" aria-pressed={pressed} onClick={onClick}>{children}</button>;
}

export function DeltaPill({ tone = "good", children }: { tone?: "good" | "care" | "flat"; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{tone === "good" && <Icon name="up" size={14} />}{children}</span>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="toggle" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

export function ListRow({ label, value, chevron = true, onClick }: { label: string; value?: React.ReactNode; chevron?: boolean; onClick?: () => void }) {
  return (
    <button className="row" onClick={onClick}>
      <span>{label}</span>
      <span className="value">{value}{chevron && <Icon name="chevron" size={20} />}</span>
    </button>
  );
}

export function TextField({ label, placeholder, value, onChange, onSubmit, onMic, autoFocus, name, micActive, type, autoComplete, trailing, inputMode }: { inputMode?: "numeric" | "text" | "email"; type?: string; autoComplete?: string; trailing?: React.ReactNode; label?: string; placeholder?: string; value?: string; onChange?: (v: string) => void; onSubmit?: () => void; onMic?: () => void; micActive?: boolean; autoFocus?: boolean; name?: string }) {
  const id = useId();
  return (
    <div className="field">
      {label && <label htmlFor={id} className="label">{label}</label>}
      <div className="input-wrap">
        <input id={id} name={name} type={type} inputMode={inputMode} placeholder={placeholder} value={value} autoFocus={autoFocus} autoComplete={autoComplete ?? "off"} enterKeyHint="done"
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          onKeyDown={onSubmit ? (e) => { if (e.key === "Enter") onSubmit(); } : undefined} />
        {trailing}
        {onMic && <button className="mic" data-active={!!micActive} aria-label={micActive ? "Stop and send" : "Speak instead"} aria-pressed={!!micActive} onClick={onMic}><Icon name="mic" size={22} /></button>}
      </div>
    </div>
  );
}

/** The big button. `level` (0..1) drives the rings while listening. */
export function TalkButton({ listening, level = 0, onClick }: { listening?: boolean; level?: number; onClick?: () => void }) {
  return (
    <button className="talk" data-listening={!!listening} onClick={onClick} aria-label={listening ? "Stop listening" : "Tell Spal"} aria-pressed={!!listening}>
      <span className="ring" style={{ transform: `scale(${1 + level * 0.18})` }} />
      <span className="ring r2" style={{ transform: `scale(${1 + level * 0.3})` }} />
      <span className="core"><Icon name="mic" size={30} /></span>
    </button>
  );
}

export type Place = "today" | "business";
export function TabBar({ place, onPlace, listening, level, onTalk }: { place: Place; onPlace: (p: Place) => void; listening?: boolean; level?: number; onTalk?: () => void }) {
  return (
    <nav className="tabbar" aria-label="Spal">
      <button className="tab" aria-current={place === "today" ? "page" : undefined} onClick={() => onPlace("today")}>
        <Icon name="home" size={22} />{place === "today" && "Today"}
      </button>
      <div className="talk-slot"><TalkButton listening={listening} level={level} onClick={onTalk} /></div>
      <button className="tab" aria-current={place === "business" ? "page" : undefined} onClick={() => onPlace("business")}>
        <Icon name="shop" size={22} />{place === "business" && "My business"}
      </button>
    </nav>
  );
}

// The phone's Back button closes the top sheet instead of leaving the app. One listener, a stack of open sheets.
const openSheets: { close: () => void }[] = [];
let skipPops = 0, popListening = false;
function ensurePopListener() {
  if (popListening || typeof window === "undefined") return;
  popListening = true;
  window.addEventListener("popstate", () => {
    if (skipPops > 0) { skipPops--; return; }
    openSheets.pop()?.close();
  });
}

export function Sheet({ open, onClose, title, children, layer = 0 }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; layer?: number }) {
  const sheet = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", h);
    ensurePopListener();
    const entry = { close: () => close.current() };
    openSheets.push(entry);
    try { history.pushState(history.state, ""); } catch { /* ignore */ }
    return () => {
      window.removeEventListener("keydown", h);
      const i = openSheets.indexOf(entry);
      if (i >= 0) { openSheets.splice(i, 1); skipPops++; try { history.back(); } catch { skipPops--; } } // closed another way: take back our history step
    };
  }, [open]);

  // Swipe the top bar down to close. Quick flicks count too.
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const down = (e: React.PointerEvent) => { drag.current = { y: e.clientY, t: Date.now(), dy: 0 }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); if (sheet.current) sheet.current.style.transition = "none"; };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || !sheet.current) return;
    d.dy = Math.max(0, e.clientY - d.y);
    sheet.current.style.transform = `translateY(${d.dy}px)`;
  };
  const up = () => {
    const d = drag.current; drag.current = null;
    const el = sheet.current; if (!d || !el) return;
    const fast = d.dy / Math.max(1, Date.now() - d.t) > 0.5;
    el.style.transition = "transform 0.2s ease-out";
    if (d.dy > 90 || (fast && d.dy > 50)) { el.style.transform = "translateY(100%)"; setTimeout(() => close.current(), 160); }
    else el.style.transform = "";
  };

  if (!open) return null;
  return (
    <>
      <div className="scrim" style={{ zIndex: 40 + layer * 2 }} onClick={onClose} />
      <div ref={sheet} className="sheet" style={{ zIndex: 41 + layer * 2 }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grab" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <div className="handle" />
          <button className="sheet-close" aria-label="Close" onPointerDown={(e) => e.stopPropagation()} onClick={onClose}><Icon name="x" size={22} /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );
}

export function ProposalCard({ title, draft, onYes, onChange, onLater }: { title: string; draft: string; onYes?: () => void; onChange?: () => void; onLater?: () => void }) {
  const [sent, setSent] = useState(false);
  return (
    <Surface>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 500, lineHeight: 1.35 }}>{title}</p>
      <p className="label" style={{ margin: "16px 0 0" }}>Message</p>
      <div style={{ background: "var(--surface-2)", borderRadius: 16, padding: "14px 16px", marginTop: 8, color: "var(--ink)" }}>{draft}</div>
      {sent ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, minHeight: 56, color: "var(--good-text)", fontWeight: 600 }}>
          <Icon name="check" size={22} /> Sent
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
          <Button block onClick={() => { setSent(true); onYes?.(); }}>Yes, send it</Button>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Button kind="secondary" small onClick={onChange}>Change it</Button>
            <Button kind="ghost" small onClick={onLater}>Not now</Button>
          </div>
        </div>
      )}
    </Surface>
  );
}
