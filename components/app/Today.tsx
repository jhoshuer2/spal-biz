"use client";
import { useEffect, useState } from "react";
import { Button, Icon, ListRow, Orb, Sheet, Surface, TabBar, TextField, type Place } from "@/components/ui";
import type { Shop } from "@/lib/supabase";
import { supabaseBrowser } from "@/lib/supabase";
import { useTheme, type ThemeMode } from "@/lib/theme";

function greeting(h: number) {
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function Today({ shop }: { shop: Shop }) {
  const { mode, setMode } = useTheme();
  const [place, setPlace] = useState<Place>("today");
  const [talk, setTalk] = useState(false);
  const [profile, setProfile] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [kept, setKept] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hour, setHour] = useState(12);
  useEffect(() => setHour(new Date().getHours()), []);

  const first = (shop.owner_name ?? "").split(/\s+/)[0] || "there";
  const mood = hour >= 19 ? "evening" : "normal";

  async function keep() {
    const text = note.trim();
    if (!text || saving) return;
    setSaving(true);
    setSaveError(null);
    const { error } = await supabaseBrowser().from("capture").insert({ shop_id: shop.id, kind: "text", text_content: text });
    setSaving(false);
    if (error) { setSaveError("I couldn't keep that. Please try again."); return; }
    setNote("");
    setTalk(false);
    setKept(text);
  }

  async function chooseTheme(m: ThemeMode) {
    setMode(m);
    await supabaseBrowser().from("shop").update({ theme: m }).eq("id", shop.id); // ignored until the theme column exists
  }

  return (
    <main data-mood={mood} style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: 120 }}>
      <div className="mood-field" style={{ padding: "20px 24px 8px" }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="icon-btn" aria-label="Profile" onClick={() => setProfile(true)}><Icon name="user" /></button>
        </div>
        {place === "today" ? (
          <>
            <h1 className="head" style={{ fontSize: 40, margin: "8px 0 0" }}>{greeting(hour)}, {first}</h1>
            <div style={{ display: "grid", placeItems: "center", padding: "16px 0 8px" }}>
              <Orb tone={mood === "evening" ? "indigo" : "lilac"} size={190} state="idle" />
            </div>
          </>
        ) : (
          <h1 className="head" style={{ fontSize: 40, margin: "8px 0 24px" }}>My business</h1>
        )}
      </div>

      <div style={{ padding: "8px 16px", maxWidth: 560, margin: "0 auto", display: "grid", gap: 12 }}>
        {place === "today" ? (
          <Surface>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 500, lineHeight: 1.35 }}>
              {kept ? "Got it. I've kept that. Tell me about the next one when it happens." : `I'm here to help ${shop.name ?? "your shop"} sell more. When you make a sale today, just tell me.`}
            </p>
          </Surface>
        ) : (
          <Surface>
            <ListRow label="Shop" value={shop.name ?? ""} chevron={false} />
            <ListRow label="Sells" value={shop.sells ?? ""} chevron={false} />
          </Surface>
        )}
      </div>

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 16, padding: "0 24px", maxWidth: 560, margin: "0 auto", zIndex: 20 }}>
        <TabBar place={place} onPlace={setPlace} onTalk={() => setTalk(true)} />
      </div>

      <Sheet open={talk} onClose={() => setTalk(false)} title="Tell Spal">
        <h2 className="head" style={{ fontSize: 26, margin: "0 0 16px" }}>What happened?</h2>
        <TextField value={note} onChange={setNote} onSubmit={keep} placeholder="Sold two tins of milk, ₦4,500" autoFocus />
        {saveError && <p role="alert" style={{ color: "var(--care-text)", margin: "12px 4px 0" }}>{saveError}</p>}
        <div style={{ marginTop: 16 }}><Button block onClick={keep} disabled={!note.trim() || saving}>{saving ? "Keeping it" : "Tell Spal"}</Button></div>
      </Sheet>

      <Sheet open={profile} onClose={() => setProfile(false)} title="Profile">
        <h2 className="head" style={{ fontSize: 26, margin: "0 0 4px" }}>{shop.owner_name}</h2>
        <p className="label" style={{ margin: "0 0 12px" }}>{shop.name}</p>
        <p className="label" style={{ margin: "16px 0 4px" }}>Theme</p>
        {(["light", "dark", "auto"] as ThemeMode[]).map((m) => (
          <button key={m} className="row" onClick={() => chooseTheme(m)}>
            <span>{m === "auto" ? "Auto (follows your phone)" : m[0].toUpperCase() + m.slice(1)}</span>
            {mode === m && <Icon name="check" size={22} />}
          </button>
        ))}
      </Sheet>
    </main>
  );
}
