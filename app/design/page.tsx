"use client";
import { useEffect, useState } from "react";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { Button, Chip, DeltaPill, Icon, ListRow, Orb, ProposalCard, Roll, Segmented, Sheet, Surface, TabBar, TalkButton, TextField, Toggle, type Place } from "@/components/ui";
import type { OrbState, OrbTone } from "@/components/ui/Orb";
import { DayDetail, type Row } from "@/components/app/DaySheet";
import { EditEntry } from "@/components/app/EditEntry";
import { SetPassword } from "@/components/app/SetPassword";
import type { SupabaseClient } from "@supabase/supabase-js";

type Mood = "strong" | "normal" | "slow" | "evening";
type Range = "day" | "week" | "month";
const TONE: Record<Mood, OrbTone> = { strong: "lime", normal: "lilac", slow: "peach", evening: "indigo" };
const MOOD_LINE: Record<Mood, string> = {
  strong: "Strong day so far. Let's keep it going.",
  normal: "Yesterday was ₦38,500. Let's beat it today.",
  slow: "A quiet one so far. Still plenty of day left.",
  evening: "Ready to close? Did I miss anything?",
};
const STATS: Record<Range, { value: number; label: string; delta: string }> = {
  day: { value: 42300, label: "Today so far", delta: "₦8,000 more than last Tuesday" },
  week: { value: 214300, label: "This week", delta: "₦21,500 more than last week" },
  month: { value: 912800, label: "This month", delta: "₦64,000 more than last month" },
};


const at = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const SAMPLE: Row[] = [
  { id: "1", kind: "sale", amount_kobo: 450000, occurred_at: at(9, 12), item_id: null, quantity: null, customer_id: null, note: "3 milk, 1 sugar", due_date: null },
  { id: "2", kind: "sale", amount_kobo: 3000000, occurred_at: at(11, 40), item_id: "rice", quantity: 2, customer_id: "chidi", note: null, due_date: null },
  { id: "3", kind: "credit_sale", amount_kobo: 1200000, occurred_at: at(14, 5), item_id: "rice", quantity: 1, customer_id: "blessing", note: null, due_date: "2026-11-13" },
  { id: "4", kind: "payment_received", amount_kobo: 500000, occurred_at: at(15, 30), item_id: null, quantity: null, customer_id: "emeka", note: null, due_date: null },
  { id: "5", kind: "expense", amount_kobo: 300000, occurred_at: at(16, 2), item_id: null, quantity: null, customer_id: null, note: "fuel", due_date: null },
];
const BUSY: Row[] = [
  ...Array.from({ length: 140 }, (_, i): Row => ({ id: `b${i}`, kind: i % 17 === 0 ? "credit_sale" : "sale", amount_kobo: (300 + ((i * 137) % 4200)) * 100, occurred_at: at(8 + Math.floor(i / 12), (i * 7) % 60), item_id: ["rice", "milk", "bread", "sugar", "oil"][i % 5], quantity: 1 + (i % 4), customer_id: i % 17 === 0 ? "blessing" : i % 9 === 0 ? "chidi" : null, note: null, due_date: i % 17 === 0 ? "2026-11-13" : null })),
  { id: "x1", kind: "expense", amount_kobo: 300000, occurred_at: at(10, 5), item_id: null, quantity: null, customer_id: null, note: "fuel", due_date: null },
  { id: "x2", kind: "expense", amount_kobo: 150000, occurred_at: at(13, 20), item_id: null, quantity: null, customer_id: null, note: "transport", due_date: null },
  { id: "x3", kind: "payment_received", amount_kobo: 500000, occurred_at: at(15, 30), item_id: null, quantity: null, customer_id: "emeka", note: null, due_date: null },
];
const SAMPLE_CUST = new Map([["chidi", "Mama Chidi"], ["blessing", "Blessing"], ["emeka", "Emeka"]]);
const SAMPLE_ITEMS = new Map([["rice", "bag of rice"], ["milk", "tin of milk"], ["bread", "bread"], ["sugar", "sugar"], ["oil", "palm oil"]]);

const STUB = { auth: { updateUser: async () => ({ error: null }) } } as unknown as SupabaseClient; // the edit form only touches the database when saved

function useLevel(active: boolean) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!active) { setLevel(0); return; }
    let t = 0;
    const id = setInterval(() => { t += 0.18; setLevel(Math.max(0, Math.min(1, 0.45 + 0.35 * Math.sin(t) + 0.2 * Math.sin(t * 2.7 + 1)))); }, 60);
    return () => clearInterval(id);
  }, [active]);
  return level;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: "48px 20px 0", maxWidth: 960, margin: "0 auto" }}>
      <h2 className="head" style={{ fontSize: 28, margin: "0 0 20px" }}>{title}</h2>
      {children}
    </section>
  );
}

export default function DesignPage() {
  const { mode, setMode } = useTheme();
  const [mood, setMood] = useState<Mood>("normal");
  const [range, setRange] = useState<Range>("day");
  const [place, setPlace] = useState<Place>("today");
  const [listening, setListening] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [toggle, setToggle] = useState(true);
  const [chip, setChip] = useState("All");
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const level = useLevel(listening);
  const orbState: OrbState = listening ? "listening" : "idle";
  const stat = STATS[range];

  return (
    <main style={{ paddingBottom: 96 }}>
      {/* Review controls */}
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "var(--bg)", borderBottom: "1px solid var(--line)", padding: "10px 20px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <Segmented<ThemeMode> label="Theme" value={mode} onChange={setMode} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "auto", label: "Auto" }]} />
        <Segmented<Mood> label="Mood of the day" value={mood} onChange={setMood} options={[{ value: "strong", label: "Strong" }, { value: "normal", label: "Normal" }, { value: "slow", label: "Slow" }, { value: "evening", label: "Evening" }]} />
      </div>

      {/* Today */}
      <Section title="Today">
        <div data-mood={mood} style={{ maxWidth: 430, margin: "0 auto", borderRadius: 36, overflow: "hidden", background: "var(--bg)", boxShadow: "0 0 0 1px var(--line)", position: "relative", paddingBottom: 24 }}>
          <div className="mood-field" style={{ padding: "28px 24px 8px" }}>
            {place === "today" ? (
              <>
                <h3 className="head" style={{ fontSize: 40, margin: 0 }}>{mood === "evening" ? "Good evening, Amaka" : "Good morning, Amaka"}</h3>
                <p className="label" style={{ margin: "10px 0 0", fontSize: 16 }}>{MOOD_LINE[mood]}</p>
                <div style={{ display: "grid", placeItems: "center", padding: "12px 0 4px" }}>
                  <Orb state={orbState} tone={TONE[mood]} size={200} level={level} />
                </div>
              </>
            ) : (
              <h3 className="head" style={{ fontSize: 40, margin: "0 0 24px" }}>My business</h3>
            )}
          </div>

          <div style={{ padding: "8px 16px 0", display: "grid", gap: 12 }}>
            {place === "today" ? (
              <>
                <Surface>
                  <div style={{ display: "grid", gap: 12 }}>
                    <span className="label">{stat.label}</span>
                    <Segmented<Range> label="Range" value={range} onChange={setRange} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
                  </div>
                  <div className="num" style={{ fontSize: 64, marginTop: 18, color: "var(--ink)" }}><Roll prefix="₦" value={stat.value} /></div>
                  <div style={{ marginTop: 14 }}><DeltaPill>{stat.delta}</DeltaPill></div>
                </Surface>
                <ProposalCard title="Blessing is due to pay ₦12,000 today. Should I send her a reminder?" draft="Hi Blessing, a small reminder about the ₦12,000 for the rice, due today. Thank you! Amaka Stores" />
              </>
            ) : (
              <Surface>
                <ListRow label="Customers" value="24" />
                <ListRow label="Who owes me" value={<span style={{ color: "var(--care-text)", fontWeight: 600 }}>₦12,000</span>} />
                <ListRow label="This week" value="₦214,300" />
                <ListRow label="Stock running low" value="3 items" />
              </Surface>
            )}
          </div>
          <div style={{ position: "sticky", bottom: 16, padding: "20px 24px 0" }}>
            <TabBar place={place} onPlace={setPlace} listening={listening} level={level} onTalk={() => setListening((l) => !l)} />
          </div>
        </div>
        <p className="label" style={{ textAlign: "center", marginTop: 16 }}>Tap the big button to hear the orb listen. Switch mood and theme above.</p>
      </Section>

      {/* Colour */}
      <Section title="Colour">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 12 }}>
          {[
            ["bg", "--bg"], ["surface", "--surface"], ["surface-2", "--surface-2"], ["ink", "--ink"], ["ink-2", "--ink-2"], ["ink-3", "--ink-3"],
            ["action", "--action"], ["good", "--good"], ["care", "--care"],
          ].map(([n, v]) => (
            <div key={n}>
              <div style={{ height: 64, borderRadius: 16, background: `var(${v})`, boxShadow: "0 0 0 1px var(--line)" }} />
              <div style={{ fontSize: 13, marginTop: 6 }}>{n}</div>
            </div>
          ))}
        </div>
        <p className="label" style={{ marginTop: 20 }}>Mood fields</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginTop: 8 }}>
          {(["strong", "normal", "slow", "evening"] as Mood[]).map((m) => (
            <div key={m} data-mood={m} className="mood-field" style={{ background: "var(--mood-from)", height: 96, borderRadius: 16, padding: 12, display: "flex", alignItems: "flex-end", fontSize: 14, fontWeight: 600, textTransform: "capitalize" }}>{m}</div>
          ))}
        </div>
      </Section>

      {/* Type */}
      <Section title="Type">
        <Surface>
          <div className="head" style={{ fontSize: "min(56px, 11vw)" }}>Good morning, Amaka</div>
          <div className="num" style={{ fontSize: "min(88px, 11vw)", marginTop: 20 }}>₦1,284,500</div>
          <p style={{ fontSize: 16, margin: "20px 0 0" }}>Blessing is due to pay ₦12,000 today. Should I send her a reminder?</p>
          <p className="label" style={{ margin: "12px 0 0" }}>Ẹ kú àárọ̀ · Ọjọ́ òní · Ṣé ó dára? · Ị mere ọ́ma · Ụlọ ahịa</p>
          <p className="muted" style={{ fontSize: 13, margin: "12px 0 0" }}>Headlines: Neue Haas Grotesk Display (shown here with Inter Tight until the licensed files arrive). Text and numerals: Source Sans 3, light for big numbers. Both stand-ins cover ₦ and the Yoruba and Igbo marks.</p>
        </Surface>
      </Section>

      {/* Day details */}
      <Section title="Behind the number">
        <p className="label" style={{ margin: "0 0 8px" }}>A quiet day</p>
        <Surface><div style={{ maxWidth: 430 }}><DayDetail rows={SAMPLE} custNames={SAMPLE_CUST} itemNames={SAMPLE_ITEMS} onPick={setEditRow} /></div></Surface>
        <EditEntry row={editRow} sb={STUB} shopId="x" custNames={SAMPLE_CUST} itemNames={SAMPLE_ITEMS} onClose={() => setEditRow(null)} onChanged={() => {}} />
        <p className="label" style={{ margin: "24px 0 8px" }}>A busy day: 140 sales, scroll inside the box</p>
        <div className="surface" style={{ maxWidth: 470, maxHeight: 620, overflowY: "auto", padding: "12px 20px" }}><DayDetail header={<h2 className="head" style={{ fontSize: 24, margin: "0 0 12px" }}>Today</h2>} rows={BUSY} custNames={SAMPLE_CUST} itemNames={SAMPLE_ITEMS} /></div>
      </Section>

      {/* Orb */}
      <Section title="The orb">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 16 }}>
          {(["idle", "listening", "thinking", "speaking"] as OrbState[]).map((s) => (
            <Surface key={s}>
              <div style={{ display: "grid", placeItems: "center" }}><Orb state={s} tone={TONE[mood]} size={128} level={s === "listening" ? 0.55 : 0} /></div>
              <div className="label" style={{ textAlign: "center", marginTop: 8, textTransform: "capitalize" }}>{s}</div>
            </Surface>
          ))}
        </div>
      </Section>

      {/* Buttons */}
      <Section title="Buttons and the big button">
        <Surface>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <Button>Yes, send it</Button>
            <Button kind="secondary">Change it</Button>
            <Button kind="ghost">Not now</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div style={{ display: "flex", gap: 32, alignItems: "center", marginTop: 28 }}>
            <TalkButton />
            <TalkButton listening level={0.6} />
            <button className="icon-btn" aria-label="Add"><Icon name="plus" /></button>
          </div>
        </Surface>
      </Section>

      {/* Controls */}
      <Section title="Controls">
        <div style={{ display: "grid", gap: 16, maxWidth: 430 }}>
          <Surface>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["All", "Owing", "Regulars", "New"].map((c) => <Chip key={c} pressed={chip === c} onClick={() => setChip(c)}>{c}</Chip>)}
            </div>
          </Surface>
          <Surface>
            <ListRow label="Language" value="English" />
            <div className="row"><span>Notify me in the morning</span><Toggle checked={toggle} onChange={setToggle} label="Notify me in the morning" /></div>
            <ListRow label="Theme" value={mode[0].toUpperCase() + mode.slice(1)} onClick={() => setSheet(true)} />
          </Surface>
          <Surface><TextField label="Customer name" placeholder="Mama Chidi" /></Surface>
        </div>
      </Section>

      <Section title="Account sheets"><Button kind="secondary" onClick={() => setPwOpen(true)}>Open the password sheet</Button></Section>
      <SetPassword open={pwOpen} onClose={() => setPwOpen(false)} sb={STUB} email="amaka@example.com" />

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Theme">
        <h3 className="head" style={{ fontSize: 24, margin: "0 0 12px" }}>Theme</h3>
        {(["light", "dark", "auto"] as ThemeMode[]).map((m) => (
          <button key={m} className="row" onClick={() => { setMode(m); setSheet(false); }}>
            <span style={{ textTransform: "capitalize" }}>{m === "auto" ? "Auto (follows your phone)" : m}</span>
            {mode === m && <Icon name="check" size={22} />}
          </button>
        ))}
      </Sheet>
    </main>
  );
}
