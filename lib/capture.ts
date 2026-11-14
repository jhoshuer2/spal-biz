import type { SupabaseClient } from "@supabase/supabase-js";
import { isNetworkError } from "./outbox";

export type Reply = { captureId: string; note: string; heard?: string; lines: string[]; question: string | null; options?: string[]; photo?: boolean; status: "parsed" | "needs_answer" | "failed"; limited?: boolean; changed?: boolean; offline?: boolean };

/** Ask Spal to understand a note that is already saved. */
export async function parseCapture(sb: SupabaseClient, captureId: string, note: string, context?: string, heard?: string, photo?: boolean): Promise<Reply> {
  const failed: Reply = { captureId, note, heard, photo, lines: [], question: null, status: "failed" };
  try {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch("/api/parse", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` }, body: JSON.stringify({ capture_id: captureId, context }) });
    if (r.status === 429) return { ...failed, limited: true };
    const j = await r.json();
    if (!r.ok || j.status === "failed") return failed;
    const readText = photo ? (j.read as string | undefined) || note : undefined;
    return { captureId, note: readText ?? note, heard: photo ? readText : heard, photo, lines: j.lines ?? [], question: j.question ?? null, options: j.options ?? [], status: j.status, changed: !!j.changed };
  } catch (e) {
    return { ...failed, offline: isNetworkError(e) };
  }
}

/**
 * Keep her words, then ask Spal to understand them. The raw note is always kept, even if reading it fails.
 * With no signal nothing is lost: `offline` tells the caller to keep it on the phone for later.
 * `createdAt` is when she really said it, for notes that waited.
 */
export async function sendNote(sb: SupabaseClient, shopId: string, text: string, context?: string, voice?: { blob: Blob }, createdAt?: string): Promise<{ reply?: Reply; keepFailed?: boolean; offline?: boolean }> {
  const t = text.trim();
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { offline: true };
  const base = voice ? { shop_id: shopId, kind: "voice", transcript: t } : { shop_id: shopId, kind: "text", text_content: t };
  const row = createdAt ? { ...base, created_at: createdAt } : base;
  const { data: cap, error } = await sb.from("capture").insert(row).select("id").single();
  if (error || !cap) return isNetworkError(error) ? { offline: true } : { keepFailed: true };
  if (voice) {
    // Keep the audio too, so a better parser can re-read it later. Best effort: never blocks her.
    const path = `${shopId}/${cap.id}.${voice.blob.type.includes("mp4") ? "m4a" : "webm"}`;
    sb.storage.from("captures").upload(path, voice.blob, { contentType: voice.blob.type }).then(({ error: e }) => { if (!e) sb.from("capture").update({ media_path: path }).eq("id", cap.id).then(() => {}); });
  }
  return { reply: await parseCapture(sb, cap.id, t, context, voice ? t : undefined) };
}

/**
 * Take back everything a note did: remove what it added, restore what it changed, bring back what it removed.
 * Her original words stay, so she can say it again.
 */
export async function undoNote(sb: SupabaseClient, captureId: string) {
  const { data: hist } = await sb.from("event_history").select("id, event_id, action, before").eq("capture_id", captureId).order("created_at", { ascending: false });
  for (const h of hist ?? []) {
    const b = h.before as Record<string, unknown>;
    if (h.action === "update") {
      await sb.from("event").update({ kind: b.kind, amount_kobo: b.amount_kobo, customer_id: b.customer_id, item_id: b.item_id, quantity: b.quantity, due_date: b.due_date, note: b.note }).eq("id", h.event_id);
    } else {
      await sb.from("event").insert(b); // a removed record comes back exactly as it was
    }
  }
  await sb.from("event").delete().eq("capture_id", captureId);
  await sb.from("event_history").delete().eq("capture_id", captureId);
  await sb.from("capture").update({ status: "new" }).eq("id", captureId);
}

/** A photo of her notebook, a receipt or a list: keep it, then ask Spal to read it. Needs signal. */
export async function sendPhoto(sb: SupabaseClient, shopId: string, blob: Blob): Promise<{ reply?: Reply; failed?: "offline" | "keep" }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { failed: "offline" };
  const { data: cap, error } = await sb.from("capture").insert({ shop_id: shopId, kind: "photo" }).select("id").single();
  if (error || !cap) return { failed: isNetworkError(error) ? "offline" : "keep" };
  const path = `${shopId}/${cap.id}.jpg`;
  const { error: up } = await sb.storage.from("captures").upload(path, blob, { contentType: "image/jpeg" });
  if (up) return { failed: isNetworkError(up) ? "offline" : "keep" };
  await sb.from("capture").update({ media_path: path }).eq("id", cap.id);
  return { reply: await parseCapture(sb, cap.id, "(She sent a photo.)", undefined, undefined, true) };
}
