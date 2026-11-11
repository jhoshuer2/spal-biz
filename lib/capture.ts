import type { SupabaseClient } from "@supabase/supabase-js";

export type Reply = { captureId: string; note: string; heard?: string; lines: string[]; question: string | null; status: "parsed" | "needs_answer" | "failed" };

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
    const j = await r.json();
    if (!r.ok || j.status === "failed") return { reply: failed };
    return { reply: { captureId: cap.id, note: t, heard, lines: j.lines ?? [], question: j.question ?? null, status: j.status } };
  } catch {
    return { reply: failed };
  }
}

/** Remove what a note created, so she can say it again. Her original words stay. */
export async function undoNote(sb: SupabaseClient, captureId: string) {
  await sb.from("event").delete().eq("capture_id", captureId);
  await sb.from("capture").update({ status: "new" }).eq("id", captureId);
}
