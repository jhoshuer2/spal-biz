# SPAL Biz: Project Plan and Status

[PRODUCT.md](PRODUCT.md) is the source of truth for what Spal is. This file says how it is built and where it stands. If the two disagree, PRODUCT.md wins and this file gets fixed. Last refreshed 11 Nov 2026.

## 1. Where we are

Steps 1 to 5 of the build sequence are done and live at https://spal-biz.vercel.app. The product runs end to end for one owner: she tells Spal, Spal keeps it, tells her something useful, and offers to act. The next stage is a one-week pilot with 3 to 5 owners (see [PILOT.md](PILOT.md)).

| Build step | State |
| --- | --- |
| 1. Plan | Done |
| 2. Vercel | Done. `main` deploys to production, other branches get previews |
| 3. Storage | Done. Supabase Postgres with row-level security, private storage bucket, anonymous sign-in |
| 4. Design system | Done and approved by Joshua. Lives in `.claude/skills/spal-design-system/SKILL.md`, previewed at `/design` |
| 5. App | Built (see section 3). Pilot next |

## 2. How it is built

- **App:** Next.js 15 (App Router) and React 19, TypeScript, installable PWA. Deployed on Vercel.
- **Database and auth:** Supabase. Every owner gets a private account silently (anonymous sign-in); she turns it into a real account with email (link or code) and can add a password. Row-level security means a shop can only ever read and write its own rows.
- **Understanding notes:** Claude API (`claude-opus-5-5`, low effort, structured output with a plain-JSON retry). The model reads the note plus her recent records and returns a list of add, update or delete actions. **Code does all the money arithmetic**: the model gives a total, or a unit price and a quantity, and the server multiplies. Every update or delete keeps a copy so it can be undone.
- **Voice:** recorded in the browser, turned into text by ElevenLabs Scribe (English mode, which suits Nigerian English and Pidgin). The audio is kept with the note.
- **Reminders:** Web Push (VAPID keys). A GitHub Actions job calls `/api/cron/nudges` every 10 minutes. That route decides, per shop, whether Spal has anything worth saying.
- **Protection:** Cloudflare Turnstile on sign-up, daily per-account caps (150 notes, 100 recordings) counted in the database, input length limits.
- **Offline:** a service worker lets the app open with no signal. Notes and recordings made offline wait in the phone's IndexedDB and are sent in order when signal returns, stamped with the time she really said them.
- **Fonts:** Neue Haas Grotesk Display for headlines (Inter Tight stands in until Joshua supplies licensed files), Source Sans 3 for text and numbers.

### Where things are

| Path | What |
| --- | --- |
| `components/app/` | The screens: Today, Closing, DaySheet (details behind a number), EditEntry, Reminder cards, Profile sheets |
| `components/ui/` | Design-system components: Button, Surface, Orb, Roll (number roll), TabBar, Sheet and others |
| `lib/` | Pure logic with tests run during development: `records.ts`, `apply.ts` (add, fix, remove), `day.ts`, `regulars.ts`, `nudges.ts`, `outbox.ts`, `export.ts` |
| `app/api/` | `parse`, `transcribe`, `push/test`, `cron/nudges`, `account/delete`, `admin/summary`, `health` |
| `supabase/migrations/` | The database, in order. Each file is run by hand in the Supabase SQL Editor |
| `design/references/` | The reference board Joshua art directed from |

## 3. What is built

**The core loop**
- **She tells it.** Text or voice, tap the big button. Corrections work the same way: "only three paid", "remove the pepper soup", "last Tuesday's rice was wrong".
- **Spal keeps it.** Sales, credit sales, payments, expenses, stock notes, an overall day figure. Customers and items are created as she names them. A debt always has a customer.
- **Spal asks instead of guessing.** "Is that 5,000 each, or all together?"
- **Spal tells her.** The number for today, who owes her, the closing summary against the same weekday last week, "Yesterday was ₦38,500" next morning.
- **Spal does it.** Debt reminders and regulars win-back messages: she sees every word, can change it, and Spal opens WhatsApp ready to send. She taps send, so nothing leaves without her.

**The days**
- Onboarding in three questions, no sign-up wall, instant first screen.
- Closing conversation that fits the day she had, and learns her closing time from when she actually closes.
- Tap "Today so far" to see everything behind the number: Sold and Spent tiles that stay in view, search, "By item" totals, pages of 80, step back through days. Tap any entry to fix or remove it.
- My business: her days and what she is owed.

**Reminders** (need setup, see section 6): closing at her usual time, a debt due this morning, a regular who has gone quiet. At most one of each kind a day, nothing for a shop that has gone silent, never at night.

**Regulars win-back:** a regular is someone who bought on at least 3 different days. They are "quiet" when they have been away longer than 1.5 times their own usual gap, and never less than 7 days or more than 90. Someone who owes money gets a debt reminder instead. One offer at a time, never the same person twice in two weeks. When a messaged customer comes back, Spal says so.

**Trust and readiness:** privacy and terms pages (draft, to be reviewed by a lawyer), download my data (Excel or complete copy), delete my account and everything, a "Something wrong? Tell us" button, automatic error reports, and an admin page at `/admin` for Joshua.

## 4. Data model

`shop` (owner, name, what she sells, theme, photo, usual closing time) · `customer` · `item` · `capture` (her raw words or recording, never deleted) · `event` (sale, credit_sale, payment_received, expense, stock_note, day_total; amounts in integer kobo) · `event_history` (how a record was before a correction, for undo) · `day_close` · `proposal` (what Spal offered: debt_reminder or win_back; pending, approved, edited, declined) · `push_subscription` · `nudge_log` · `usage_counter` · `app_report` · view `debt` (credit minus payments per customer).

The migrations, in order: `init`, `shop_theme`, `usage_limits`, `avatar`, `push`, `event_history`, `reports`.

## 5. Decisions made on the open questions

| Question from PRODUCT.md | Decision so far |
| --- | --- |
| First action Spal takes | Debt reminders, then regulars win-back |
| How messages reach customers | WhatsApp opens with the message ready; she taps send. No customer opt-in system needed yet |
| Languages at launch | English and Pidgin, typed or spoken. Yoruba, Igbo, Hausa after testing |
| Voice and photo capture reliability | Voice built and being tested with real Pidgin in the pilot. The fallback is always "I heard: …" plus a one-tap fix. **Notebook photo capture is not built yet** |
| Poor or no network | Opens offline; notes wait on the phone and send later |
| Pricing | Not tested. The data model leaves room for a wallet and transfer fee |
| People who have not started a business yet | Out of scope until the shop-owner flow is proven |

## 6. Setup checklist

Environment variables in Vercel (only names here, never values):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ADMIN_EMAIL`, `NEXT_PUBLIC_CONTACT_EMAIL`. Optional: `ANTHROPIC_MODEL` (for example `claude-haiku-5-5` to cut cost), `NEXT_PUBLIC_GOOGLE_SIGNIN=1`.

Also: the `CRON_SECRET` repository secret in GitHub, Supabase email (own SMTP, site URL and redirect), the Turnstile secret in Supabase, and all migrations run. `/api/health` reports which keys reached the deploy.

## 7. What is not built yet

- Notebook and receipt photo capture.
- Day 3 insight, day 7 summary, and "welcome back" after three quiet days (the first-week payoffs in PRODUCT.md).
- Restock hints.
- Posts, flyers and WhatsApp status from what she sells.
- Network features (advertising to other Spal users) and financing: both need many users and months of records.
- Pricing and payments.
- Licensed Neue Haas Grotesk files, and a proper lawyer-reviewed privacy policy and terms.

## 8. Risks

- **Wrong amounts** destroy trust faster than anything. Mitigations in place: Spal says back what it understood every time, asks when a price is unclear, shows "I heard: …", keeps every raw note, and every fix can be undone.
- **Voice accuracy on Pidgin and accents.** Unproven until the pilot.
- **Nudges that feel like spam.** Caps and quiet rules are in; the pilot will show whether they are right.
- **Messaging customers can hurt relationships.** She approves every word and sends from her own WhatsApp.
- **Cost.** Each note is a paid AI call (about half a cent on the current model). Daily caps limit abuse; a cheaper model is a one-variable switch if quality holds.
- **Blind spots.** Captcha stops scripted testing, so real-world failures are found through `/admin`, error reports and the feedback button.
- **Data she depends on lives in our database.** Export is built. Backups depend on the Supabase plan and need checking before launch.

## 9. Next

1. **Pilot** with 3 to 5 owners for a week: see [PILOT.md](PILOT.md).
2. Fix what the pilot shows, in order of how many owners it hurt.
3. Day 3, day 7 and "welcome back" payoffs, then notebook photo capture.
4. Decide pricing with real owners, not before.
