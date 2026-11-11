import { NextResponse } from "next/server";

// Which services are configured in this deploy. Never returns any values, only yes or no.
export function GET() {
  return NextResponse.json({
    ok: true,
    supabaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    voiceConfigured: Boolean(process.env.ELEVENLABS_API_KEY),
    captchaConfigured: Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
  });
}
