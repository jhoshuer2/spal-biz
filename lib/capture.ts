import type { SupabaseClient } from "@supabase/supabase-js";

export type Reply = { captureId: string; note: string; heard?: string; lines: string[]; question: string | null; status: "parsed" | "needs_answer" | "failed"; limited?: boolean; changed?: boolean };

/** Keep her words, then ask Spal to understand them. The raw note is always kept, even if reading it fails. */
export async function sendNote(sb: SupabaseClient, shopId: string, text: string, context?: string, voice?: { blob: Blob }): Promise<{ reply?: Reply; keepFailed?: boolean }> {
  const t = text.trim();
  const row = voice ? { shop_id: shopId, kind: "voice", transcript: t } : { shop_id: shopId, kind: "text", text_content: t };
  const { data: cap, error } = await sb.from("capture").insert(row).select("id").single();
  if (error || !cap) return { keepFailed: true };
  if (voice) {
    // Keep the audio too, so a better parser can re-read it later. Best effort: never blocks her.
    const path = `${shopId}/${cap.id}.${voice.blob.type.includes("mp4") ? "m4a" : "webm"}`;
    sb.storage.from("captures").upload(path, voice.blob, { contentType: voice.blob.type }).then(({ error: e }) => { if (!e) sb.from("capture").update({ media_path: path }).eq("id", cap.id).then(() => {}); });
  }
  const heard = voice ? t : undefined;
  const failed: Reply = { captureId: cap.id, note: t, heard, lines: [], question: null, status: "failed" };
  try {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch("/api/parse", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` }, body: JSON.stringify({ capture_id: cap.id, context }) });
    if (r.status === 429) return { reply: { ...failed, limited: true } };
    const j = await r.json();
    if (!r.ok || j.status === "failed") return { reply: failed };
    return { reply: { captureId: cap.id, note: t, heard, lines: j.lines ?? [], question: j.question ?? null, status: j.status, changed: !!j.changed } };
  } catch {
    return { reply: failed };
  }
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
