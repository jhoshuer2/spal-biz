# SPAL Biz

The assistant you can't afford to hire: a buddy that knows your business, helps you sell more, and handles the work you don't have hands for.

Live at https://spal-biz.vercel.app. A mobile-first, installable web app for shop owners.

| Read this | For |
| --- | --- |
| [PRODUCT.md](PRODUCT.md) | What Spal is and why. The source of truth |
| [PLAN.md](PLAN.md) | How it is built, what is done, what is next, and the setup checklist |
| [PILOT.md](PILOT.md) | How to run the one-week pilot with 3 to 5 owners |
| `.claude/skills/spal-design-system/SKILL.md` | The design system: tokens, components, the orb, and the rules against generic design |

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

It needs the environment variables listed in PLAN.md section 6. `/api/health` on any deploy says which ones arrived (yes or no, never the values). `/design` shows the design system. `/admin` is for the person running Spal.

## The database

Run the files in `supabase/migrations/` in order, by hand, in the Supabase SQL Editor.
