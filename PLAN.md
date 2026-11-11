# SPAL Biz: Project Plan

Derived from [PRODUCT.md](PRODUCT.md), which stays the source of truth. If the two disagree, PRODUCT.md wins and this file gets fixed.

## 1. What we are building, in one paragraph

A mobile-first web app (installable PWA) with three places: **Today**, **Talk**, **My business**. She tells Spal what happened by voice, text or photo. Spal turns that into books, debts, stock and customer records without showing a form, then speaks first with something useful and offers to act (reminders, restock list, messages to regulars), always asking before it acts.

## 2. Principles that drive technical choices

| Product rule | Technical consequence |
| --- | --- |
| No sign-up wall, account created at first closing | Anonymous session from second one; upgrade it to a real account in place (no data migration) |
| She never sees a form | Every write comes from an AI-parsed "capture"; UI only confirms in one line and lets her correct by talking |
| Spal speaks first | A server-side "brief" job decides what to say; the UI never waits for a question |
| Asks before it acts | Every outward action is a **proposal** she approves; nothing is sent without one |
| Remembers | Structured memory (customers, items, habits), not chat history alone |
| Useful at every level of detail | Schema allows partial records: a sale with no items, no customer, only a day total |
| Stays out of the way | Quiet by default; a nudge must pass a value threshold and a frequency cap |

## 3. Recommended stack

- **App:** Next.js (App Router) + TypeScript + Tailwind, PWA. Deployed on Vercel.
- **Storage:** **Supabase** (recommended over Neon). Reasons: anonymous sign-in that upgrades to a permanent account, row-level security per shop, and file storage for notebook/receipt photos, all in one. Neon would mean building auth and storage separately.
- **AI:** Claude API for understanding (text to structured events via tool use; photos via vision) and for writing in her voice. Deterministic code computes the numbers; the model never does arithmetic on money.
- **Voice in:** speech-to-text service, to be chosen by testing on Nigerian English and Pidgin samples (open question 4). Behind an interface so it can be swapped.
- **Messaging out (later):** WhatsApp Business API / SMS, behind the same proposal system.
- **Jobs:** Vercel Cron + Supabase queue for briefs, reminders due today, and closing check-ins at her usual time.
- Money stored as integer kobo. Single currency (NGN) at first, with a currency column so it is not a rewrite later.

## 4. Data model (first cut)

- `shop` (owner, name, what she sells, language, usual closing time, trust level)
- `capture` (raw input: audio/text/photo, transcript, created_at, status). Never deleted; it is the audit trail and lets us re-parse when the parser improves.
- `event` (kind: sale | expense | credit_sale | payment_received | stock_note | day_total; amount; occurred_at; confidence; source capture; links to customer and items, all nullable)
- `customer` (name, aliases, phone optional, consent to be messaged, last_seen, usual items)
- `item` (name, aliases, typical price, last known stock hint)
- `debt` (derived from credit_sale and payment events; due date; reminder state)
- `day_close` (the closing conversation and its summary, so days stay coherent)
- `proposal` (what Spal wants to do, draft text, status: pending | approved | edited | declined | sent)
- `memory` (durable facts and habits: "catches up at 8pm", "Blessing pays Fridays")
- `brief` (what Spal said on Today, so it never repeats itself)

Ledger rule: events are append-only. A correction is a new event that supersedes the old one, so totals are always explainable.

## 5. How the core loop maps to the system

1. **She tells it.** Talk button creates a `capture`. Audio is transcribed, then the parser returns events with a confidence score and a one-line confirmation. Low confidence produces one short question ("Was that ₦4,500 or ₦45,000?"), never a form.
2. **Spal keeps it.** Entity resolution matches "Mama Chidi" to the right customer, or creates one. Debts and stock hints update from events.
3. **Spal tells her.** The brief engine runs rules over her data (day total vs same weekday last week, best seller, customer gone quiet beyond their usual gap, debt due). A model writes the sentence. A cap of one to three items on Today.
4. **Spal does it.** Rules that find something worth doing create a `proposal`. She taps yes, edits or no. Declines feed `memory` so it stops asking about that.

Closing conversation adapts to the three cases in PRODUCT.md by counting today's events and comparing the total.

## 6. Build sequence and milestones

Follows PRODUCT.md "Build sequence". Do not skip ahead.

| Step | Output | Done when |
| --- | --- | --- |
| 1. Plan | This file, plus decisions on open items below | Joshua signs off |
| 2. Vercel | Project linked, preview deploy per branch, env vars set | A change on a branch shows at a live URL |
| 3. Storage | Supabase project, schema migrations, RLS, anonymous-to-account upgrade tested | Two test shops cannot see each other's data |
| 4. Design system | Tokens, type, colour, components, the big button, Spal's voice and tone | Joshua approves it. **He art directs; wait for his references before starting.** |
| 5. App | See sub-milestones below | Amaka walkthrough from PRODUCT.md works end to end |

Step 5 sub-milestones, each shippable:

- **5a. First day:** onboarding (name, what she sells, shop name), Talk with text and voice, one-line confirmation, closing summary, save-account prompt.
- **5b. Memory and mornings:** Today screen, "Good morning, Amaka" brief, customer records from "sold rice to Mama Chidi", My business (history, customers, money).
- **5c. Debts:** credit-sale capture, debt list, first proposal (reminder), approval flow.
- **5d. Insights:** day-3 insight and day-7 summary, closing check-in at her usual time, "welcome back" after three quiet days.
- **5e. Photos:** notebook and receipt capture with correction by conversation.
- **Later, not in this plan:** regulars win-back messages, promo content, network, financing.

## 7. Recommended answers to the open questions

These are defaults so work can proceed. Joshua should overrule any of them.

| Question | Recommendation |
| --- | --- |
| First action Spal takes | **Debt reminders.** Day-one data, clear money at stake, one recipient and one clear message. Regulars win-back second. |
| How messages reach customers | Start by opening WhatsApp with the message pre-filled on her phone (she taps send), so no business API or customer opt-in is needed yet. Move to sending from Spal later, with consent captured per customer. |
| Launch languages | English and Pidgin, matching how she talks. Yoruba, Igbo, Hausa after testing. |
| Voice and photo reliability | Treat as unproven. Test with real samples before 5a depends on them. Fallback is always: show what Spal heard in one line and let her fix it by speaking or typing. |
| Poor or no network | Capture works offline (stored locally, synced later). Understanding and briefs need a connection. Confirm this is enough with shop owners. |
| Pricing | Not in scope for the build. Keep a wallet/transfer-fee path open in the data model only. |
| People who haven't started | Out of scope until the shop-owner flow works. |

## 8. Risks

- **Parsing wrong amounts** destroys trust faster than anything. Mitigation: confirm in one line every time, keep raw captures, make correction as easy as capture.
- **Voice accuracy** on accents and Pidgin. Test early; do not design around an assumption.
- **Nudges that feel like software or spam.** Value threshold, frequency cap, and tone review with real owners.
- **Messaging customers** can hurt her relationships. Draft in her voice, approve every message at first.
- **Data she depends on lives in our database.** Export and backups from the start.

## 9. Needed from Joshua

1. Sign-off on the stack (Next.js, Supabase, Claude API) and the recommended open-question defaults.
2. Vercel access (step 2) and a Supabase project (step 3).
3. Design references (step 4).
4. Done: dedicated GitHub repo for SPAL Biz. It is unrelated to Navigating Adult Life, and now lives at `jhoshuer2/spal-biz`.
