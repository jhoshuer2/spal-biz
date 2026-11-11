import { naira } from "./format";

export type NudgeKind = "closing" | "debt";
export type Nudge = { kind: NudgeKind; title: string; body: string; tag: string };

export type NudgeInput = {
  nowMin: number;               // minutes after midnight, Lagos time
  closeMin: number;             // her usual closing time
  firstName: string;
  closedToday: boolean;
  activeRecently: boolean;      // she told Spal something today or in the last 3 days
  due: { name: string; owedKobo: number; overdue: boolean } | null; // top debt due, not yet handled today
  sentToday: NudgeKind[];
};

export const DEBT_FROM = 9 * 60;      // debts are mentioned in the morning
export const DEBT_UNTIL = 11 * 60;
const CLOSING_WINDOW = 60;            // minutes after her usual time

/** Decide what, if anything, Spal says right now. Quiet by default: at most one of each kind a day, and nothing for a shop that has gone silent. */
export function decideNudges(i: NudgeInput): Nudge[] {
  const out: Nudge[] = [];
  if (i.due && i.nowMin >= DEBT_FROM && i.nowMin < DEBT_UNTIL && !i.sentToday.includes("debt")) {
    out.push({
      kind: "debt", tag: "debt",
      title: `${i.due.name} ${i.due.overdue ? "was due to pay" : "is due to pay today"}`,
      body: `${naira(i.due.owedKobo)}. Want me to send a reminder?`,
    });
  }
  if (!i.closedToday && i.activeRecently && i.nowMin >= i.closeMin && i.nowMin < i.closeMin + CLOSING_WINDOW && !i.sentToday.includes("closing")) {
    out.push({
      kind: "closing", tag: "closing",
      title: `Ready to close, ${i.firstName}?`,
      body: "Tell me if I missed anything and I'll sum up your day.",
    });
  }
  return out;
}

/** Date and time in Lagos, whatever the server's own clock says. */
export function lagosNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
