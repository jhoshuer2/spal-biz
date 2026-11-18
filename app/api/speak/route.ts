import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 20;

// Spal's voice: a warm young Nigerian woman (Rose), to match her face. Set ELEVENLABS_VOICE_ID in Vercel to choose another.
// If a voice is not usable on this account, the next one is tried, ending with a voice every account has.
const VOICES = [process.env.ELEVENLABS_VOICE_ID, "sBOOpM6ICWiYIpG41Nur", "QQswKXAu7aQVNxKFmOP8", "EXAVITQu4vr4xnSDxMaL"].filter((v): v is string => !!v);

/** Text in, spoken audio out (mp3). Only signed-in shops; capped per day. Failing here never blocks the app: the phone's own voice is the fallback. */
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { text?: string } | null;
  const text = (body?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
  if (!text) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: within, error: limErr } = await sb.rpc("bump_usage", { p_kind: "speak", p_max: 250 });
  if (limErr) console.warn("usage limit not active:", limErr.message);
  else if (within === false) return NextResponse.json({ error: "limited" }, { status: 429 });

  let r: Response | null = null, why = "network", status = 0;
  for (const v of VOICES) {
    r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${v}?output_format=mp3_22050_32`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_flash_v2_5", voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.0 } }),
    }).catch(() => null);
    if (r?.ok) break;
    status = r?.status ?? 0;
    why = r ? (await r.text().catch(() => "")).slice(0, 200) : "network";
    console.error("tts failed", v, status, why);
    if (status === 401 || status === 429 || !r) break; // the key or the network is the problem: another voice will not help
  }
  if (!r || !r.ok) return NextResponse.json({ error: "tts_failed", status, why }, { status: 502 });
  return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" } });
}
