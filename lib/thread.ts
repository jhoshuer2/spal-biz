/** The conversation on the home screen: what Spal and she have said today. Kept on the phone, one day at a time. */
export type Msg =
  | { id: string; kind: "spal"; text: string; greet?: boolean }
  | { id: string; kind: "you"; text: string; via: "voice" | "text" | "photo" }
  | { id: string; kind: "result"; lines: string[]; changed?: boolean; heard?: string; photo?: boolean; captureId: string; undone?: boolean }
  | { id: string; kind: "ask"; question: string; options: string[]; note: string; answered?: boolean; retry?: { captureId: string; note: string; heard?: string } }
  | { id: string; kind: "notice"; text: string }
  | { id: string; kind: "tips"; examples: string[] }
  | { id: string; kind: "summary"; title: string; rows: { label: string; value: string }[]; week: { d: string; on: boolean }[]; note: string };

export const mid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

const key = (shopId: string) => `spal-thread:${shopId}`;
export function loadThread(shopId: string, day: string): Msg[] {
  try {
    const j = JSON.parse(localStorage.getItem(key(shopId)) ?? "null") as { day: string; msgs: Msg[] } | null;
    return j && j.day === day && Array.isArray(j.msgs) ? j.msgs : [];
  } catch { return []; }
}
export function saveThread(shopId: string, day: string, msgs: Msg[]) {
  try { localStorage.setItem(key(shopId), JSON.stringify({ day, msgs: msgs.slice(-60) })); } catch { /* private mode: fine */ }
}
/** What goes to Spal when she chats: only the words, newest last. */
export type Turn = { role: "user" | "assistant"; content: string };
export function chatHistory(msgs: Msg[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of msgs) {
    if (m.kind === "you" && m.via !== "photo") turns.push({ role: "user", content: m.text });
    else if (m.kind === "spal") turns.push({ role: "assistant", content: m.text });
  }
  return turns.slice(-12);
}
