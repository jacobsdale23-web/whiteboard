# Dispatch Board (Next.js + Neon)

Rebuild of the Dispatch Board artifact as a real web app with Postgres (Neon)
and real email/password login (Neon Auth). This first pass covers sign-in/
sign-up and a basic Board page (Active / Upcoming / Shop) reading from real
data. Calendar, Opportunities, and the full Budget module (pay apps,
schedule of values, expenses, invoices) still need to be ported over from
the original artifact in follow-up passes.

## First-time setup

1. **Install dependencies** (requires Node.js — see below if you don't have it):
   ```
   npm install
   ```
2. **Create the database tables**: open your Neon project's SQL Editor
   (Neon Console → your project → SQL Editor) and run everything in
   `seed.sql`. This creates the tables and drops in a few sample rows so
   the board isn't empty on first load.
3. **Run it locally**:
   ```
   npm run dev
   ```
   then open http://localhost:3000 — it'll redirect you to sign in.
4. **Sign up** with `jdale@felicianawelders.com` first — that's the one
   email seeded as admin automatically (see `lib/auth/profile.ts`).
   Everyone else who signs up starts as a regular member; promote them to
   admin later from a Team/admin page (not built yet in this pass).

## If Node.js isn't installed yet

Download the **LTS** installer from [nodejs.org](https://nodejs.org),
run it, and click through the prompts (approve the admin/UAC prompt when
it appears). Then re-open your terminal and run `node --version` to
confirm before doing step 1 above.

## Deploying

Push this folder to a GitHub repo, then import it in Vercel
(vercel.com → Add New → Project). In the Vercel project's Environment
Variables settings, add the same three values from `.env.local`:
`NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `DATABASE_URL`. Vercel
will build and host it from there — every push to the main branch
redeploys automatically.

## Honest caveat on this first pass

I built the Neon Auth wiring (`lib/auth/server.ts`, `middleware.ts`, the
sign-in/sign-up server actions) directly from Neon's documentation, but
without Node installed I haven't been able to actually run `npm install`
or start the dev server to verify it against the real package — some
method names or return shapes may need small corrections once you run it
and we see real TypeScript/runtime errors. That's normal for a first
scaffold; send me whatever error shows up and I'll fix it.

## What's next

Once sign-in and the Board page are confirmed working end-to-end, the
plan is to port over (in order): Calendar, Opportunities, then the full
Budget module (pay app import, schedule of values, expenses, invoices,
Daily Logs with line-item tracking) — each as its own pass so you can
see and use each piece as it lands, same as we did in the original
artifact.
