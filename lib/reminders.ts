import { naira } from "./format";

/** Nigerian numbers to the international digits WhatsApp wants. Returns null if it can't be one. */
export function whatsappNumber(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("234")) { /* already international */ }
  else if (d.startsWith("0") && d.length === 11) d = "234" + d.slice(1);
  else if (d.length === 10) d = "234" + d;
  return /^\d{11,15}$/.test(d) ? d : null;
}

/** With a number it opens her chat with them. Without one WhatsApp lets her pick the person. */
export function waLink(phone: string | null, text: string) {
  return `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(text)}`;
}

const weekday = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));

/** Polite, short, signed with the shop. She can change every word before it goes. */
export function draftReminder(a: { name: string; owedKobo: number; dueDate: string; todayKey: string; shop: string; forWhat?: string | null }) {
  const what = a.forWhat ? ` for the ${a.forWhat}` : "";
  const amt = naira(a.owedKobo);
  const sign = a.shop ? ` ${a.shop}` : "";
  if (a.dueDate >= a.todayKey) return `Hi ${a.name}, a small reminder about the ${amt}${what}, due today. Thank you!${sign}`;
  return `Hi ${a.name}, a gentle reminder about the ${amt}${what}, which was due ${weekday(a.dueDate)}. Please let me know when you can pay. Thank you!${sign}`;
}

export function reminderTitle(a: { name: string; owedKobo: number; dueDate: string; todayKey: string }) {
  const amt = naira(a.owedKobo);
  return a.dueDate >= a.todayKey
    ? `${a.name} is due to pay ${amt} today. Want me to send a reminder?`
    : `${a.name} was due to pay ${amt} on ${weekday(a.dueDate)}. Want me to send a reminder?`;
}
