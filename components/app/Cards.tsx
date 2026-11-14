"use client";
import { useState } from "react";
import { Icon, Roll } from "@/components/ui";
import { naira } from "@/lib/format";

export type CardId = "sold" | "spent" | "owed";
export type StackCard = { id: CardId; label: string; kobo: number; lines: { label: string; value?: string }[]; empty: string };

const STRIP = 68; // how much of a card shows while it sits behind another
const FRONT = 236;

/**
 * Today as a stack of three large cards: Sold, Spent, Owed. Each peeks out with its number.
 * Tap one behind to bring it forward; tap the one in front to see everything behind the number.
 */
export function CardStack({ cards, onOpen }: { cards: StackCard[]; onOpen: (id: CardId) => void }) {
  const [front, setFront] = useState<CardId>("sold");
  const order = [...cards.filter((c) => c.id !== front), ...cards.filter((c) => c.id === front)];
  const height = FRONT + (cards.length - 1) * STRIP;

  return (
    <div className="stack" style={{ height }} role="list" aria-label="Today at a glance">
      {order.map((c, i) => {
        const isFront = c.id === front;
        return (
          <button key={c.id} role="listitem" className={`stack-card stack-${c.id}`} data-front={isFront}
            style={{ top: i * STRIP, height: FRONT, zIndex: i + 1 }}
            aria-label={`${c.label} ${naira(c.kobo)}. ${isFront ? "Tap to see the details" : "Tap to bring forward"}`}
            onClick={() => (isFront ? onOpen(c.id) : setFront(c.id))}>
            <span className="stack-head">
              <span className="stack-label">{c.label}</span>
              <span className="stack-mini num" aria-hidden="true">{naira(c.kobo)}</span>
              {isFront && <span className="stack-chev"><Icon name="chevron" size={20} /></span>}
            </span>
            <span className="stack-body" aria-hidden={!isFront}>
              <span className="num stack-big"><Roll prefix="₦" value={Math.round(c.kobo / 100)} /></span>
              <span className="stack-lines">
                {c.lines.length === 0 ? <span className="stack-empty">{c.empty}</span> : c.lines.map((l, k) => (
                  <span key={k} className="stack-line"><span>{l.label}</span>{l.value && <span>{l.value}</span>}</span>
                ))}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
