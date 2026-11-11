# SPAL Biz: One-week pilot with 3 to 5 owners

The goal is not to find bugs. It is to learn one thing: **does a busy shop owner record on day 1 and come back on day 2, and does she feel Spal knows her shop by day 7?** PRODUCT.md says that if she feels it by day 7, she stays.

## 1. Who

Pick 3 to 5 owners from your 15 interviews. Aim for a mix, because each type stresses Spal differently:

- Street food or a small restaurant (many small sales, lots of speed, voice matters most).
- A provisions shop or mall shop (credit, regulars, stock).
- A boutique (fewer, bigger sales; customers by name).
- At least one owner who is **not comfortable with technology**. If Spal fails her, you need to know.

Avoid friends who will be polite. Pick people who would tell you it is useless.

## 2. Before you start (you, about one hour)

- [ ] All setup in PLAN.md section 6 is done. `/api/health` shows every key as `true`.
- [ ] Every database migration has been run.
- [ ] You have used Spal yourself for two full days, including closing a day and a voice note in Pidgin.
- [ ] Privacy and Terms have been read by you, ideally by a lawyer. The contact email in them really gets read.
- [ ] `ADMIN_EMAIL` is set and you can open `/admin` and see yourself.
- [ ] One WhatsApp number you will answer within a few hours all week. Put it where the owners can see it.
- [ ] You know how to turn a bad account off: Supabase dashboard, Authentication, Users.

## 3. Onboarding each owner (10 minutes, in person if you can)

1. Ask her to open the link on her own phone: `https://spal-biz.vercel.app`. Do not do it for her. Watch where she hesitates.
2. She answers the three questions. Let her.
3. Show her only this: tap the big button, say what happened, same as telling an assistant. Example: "I sold two tins of milk, four thousand five hundred."
4. Have her add Spal to the home screen and allow reminders. On iPhone this only works from the home screen.
5. Have her record **one real sale from earlier today**, by voice. Do not correct her wording.
6. Tell her plainly: this is a test. Her records are hers, she can download or delete them any time, and you can see her notes while you are helping her. Do not hide that.
7. Leave. Do not coach beyond this. If you explain everything, you learn nothing.

## 4. What to send (copy and adjust)

**Invite (English)**
> Hi [Name], I'm testing an assistant for shop owners called Spal. You tell it your sales, spending and who owes you, by talking or typing, and it keeps your books and reminds you. Can you try it for one week and tell me honestly what is useless? It takes two minutes a day. I'll show you how.

**Invite (Pidgin)**
> Hi [Name], I dey test one assistant for shop owners wey dem call Spal. You go just talk or type wetin you sell, wetin you spend and who dey owe you, e go keep the book and remind you. You fit try am for one week and tell me the truth if e no good? E no go pass two minutes for day. I go show you how.

**Day 1, evening**
> How did today go with Spal? Did it ask you about closing?

**Day 2, morning**
> Good morning. Did you use Spal yesterday after we spoke? What did you tell it?

**Day 3**
> One question: what was the most annoying thing Spal did, or didn't do?

**Day 5**
> Did Spal remind you of anything? Was it useful or was it too much?

Keep every message short and answer the same day. Do not ask her to "please use it". If she did not, ask why, and write it down.

## 5. What to say to Spal (an owner card)

Give her these on a small card or message. They are examples of what Spal understands:

- "I sold three bags of rice, forty five thousand."
- "Blessing took bread on credit, three thousand, she go pay Friday."
- "Mama Chidi don pay me five thousand."
- "I bought fuel for three thousand."
- "I made about forty thousand today."
- "Only three paid, one person owes me." (a correction)
- "Remove the pepper soup." (a deletion)

## 6. What to watch (you, 10 minutes a day)

Open `/admin`. For each owner you see how many notes, on how many days, how many days she closed, voice notes, notes it could not read, and whether she came back. Also read every error and every piece of feedback.

Each day write one line per owner: what she did, what went wrong, what she said.

## 7. How you will know it worked

Of 5 owners, a good week looks like this:

| Signal | Good |
| --- | --- |
| Recorded something on day 1 | 4 of 5 |
| Came back on day 2 | 3 of 5 |
| Used Spal on at least 3 of the first 5 days | 3 of 5 |
| Closed a day at least twice | 3 of 5 |
| Notes Spal could not read | under 5% |
| Voice notes right on the first try (ask them) | 8 in 10 |
| Approved at least one message to a customer | 2 of 5 |
| "How would you feel if you could no longer use Spal?" Answer "very disappointed" | at least 1 |

If most of these are missed, do not build more features. Find out why.

## 8. Day 7: a 15 minute conversation with each owner

Ask, and write down her exact words:

1. Tell me about the last time you used Spal. What did you do?
2. What did you stop doing because Spal did it?
3. Did Spal ever get something wrong? What happened, and what did you do?
4. When Spal reminded you, how did that feel? Too much, too little, just right?
5. Did you send a message to a customer because Spal offered? What happened?
6. If you could no longer use Spal tomorrow, what would you miss? What would you not?
7. What would you pay for it? (Listen. Do not suggest a number.)
8. Who else would you tell about it, and what would you say?

## 9. When something breaks

- A wrong amount: ask what she said and what it wrote. Fix the record with her. Tell Claude the exact words.
- "I couldn't read your note": check `/admin` for the reason.
- No reminders: ask whether she allowed notifications and whether Spal is on her home screen.
- Anything that loses or changes her money records without her action: stop the pilot for that owner and tell her honestly.

## 10. After the week

1. List every problem and sort by how many owners it hurt.
2. Fix the top three before adding anything new.
3. Decide with real answers: does she come back, and what would she pay?
4. Thank them, and tell them what you changed because of them.
