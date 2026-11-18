"use client";
import { useEffect, useRef, useState } from "react";
import { Icon, TalkButton, type Place } from "@/components/ui";

/**
 * The bottom bar. One "+" for everything that is not talking (camera, photos, typing), one big button for talking.
 * While she is recording it becomes Cancel and Send, so she always knows what will happen next.
 */
export function Dock({ place, onPlace, recording, level, typing, text, onText, onMic, onCancel, onType, onCamera, onPhotos, onCloseTyping, onSend, showChip, onChip }: {
  place: Place; onPlace: (p: Place) => void; recording: boolean; level: number; typing: boolean; text: string; onText: (v: string) => void;
  onMic: () => void; onCancel: () => void; onType: () => void; onCamera: () => void; onPhotos: () => void; onCloseTyping: () => void; onSend: () => void;
  showChip: boolean; onChip: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => { if (!box.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [menu]);

  if (typing) {
    return (
      <div className="dock-type">
        <button className="dock-round" aria-label="Close the keyboard" onClick={onCloseTyping}><Icon name="x" size={22} /></button>
        <input autoFocus value={text} onChange={(e) => onText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onSend(); }}
          placeholder="Tell me, or say: delete the last record" enterKeyHint="send" aria-label="Message Spal" />
        <button className="dock-send" aria-label="Send" disabled={!text.trim()} onClick={onSend}><Icon name="arrowUp" size={24} /></button>
      </div>
    );
  }

  return (
    <div ref={box} className="dock-wrap">
      {showChip && !recording && <button className="dock-chip" onClick={onChip}><Icon name="bulb" size={16} />What to say?</button>}
      {menu && (
        <div className="dock-menu" role="menu">
          <button role="menuitem" onClick={() => { setMenu(false); onCamera(); }}><Icon name="camera" size={22} />Camera</button>
          <button role="menuitem" onClick={() => { setMenu(false); onPhotos(); }}><Icon name="image" size={22} />Photos</button>
          <button role="menuitem" onClick={() => { setMenu(false); onType(); }}><Icon name="keyboard" size={22} />Type</button>
        </div>
      )}
      <nav className="tabbar" aria-label="Spal">
        {recording ? (
          <button className="tab dock-cancel" onClick={onCancel}>Cancel</button>
        ) : (
          <button className="dock-round on-nav" aria-label="Add a photo, or type" aria-expanded={menu} onClick={() => setMenu((v) => !v)}><Icon name="plus" size={24} /></button>
        )}
        <div className="talk-slot"><TalkButton listening={recording} send={recording} level={level} onClick={onMic} /></div>
        {recording ? <span style={{ width: 64 }} /> : (
          <button className="tab" aria-label={place === "today" ? "My business" : "Back to today"} onClick={() => onPlace(place === "today" ? "business" : "today")}>
            <Icon name={place === "today" ? "shop" : "home"} size={22} />{place === "business" && "Today"}
          </button>
        )}
      </nav>
    </div>
  );
}
