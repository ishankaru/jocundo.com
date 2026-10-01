# 🎃⚽️ Kick or Treat — Tournament Theme Vote

A tiny poll for the U10 Kick or Treat Soccer Tournament (Medford, NJ). Coaches pick their
top three team themes. Runs on a Cloudflare Worker with a D1 (SQLite) database.

- **Vote page** `/` — name + team, tap 3 themes, save. Coming back on the same phone shows
  your saved picks and lets you change them.
- **One vote per coach** — a private cookie ties the browser to its vote, and the same
  name + team is treated as the same coach even from a new device or after clearing cookies.
- **Results hidden by default** — coaches only see how many people have voted.
- **Organizer page** `/results` — enter the admin key to see tallies and who voted, remove a
  vote, and flip results to public (and back) with one button.

## First-time deploy (about 5 minutes)

Requirements: Node 18+, a Cloudflare account that has the `teachearl.com` zone.

```bash
cd kick-or-treat
npm install
npx wrangler login                      # opens a browser to authorize

# 1. Create the database and copy the database_id it prints into wrangler.toml
npx wrangler d1 create kick-or-treat-poll

# 2. Create the tables
npm run db:init

# 3. Set the organizer password (pick something you'll remember)
npx wrangler secret put ADMIN_KEY

# 4. Ship it to u10.teachearl.com
npm run deploy
```

Wrangler attaches the custom domain `u10.teachearl.com` automatically and creates the DNS
record. If `u10` already has a DNS record pointing somewhere else, delete that record in
the Cloudflare dashboard first, then run `npm run deploy` again.

## Day-to-day

- Share `https://u10.teachearl.com` with coaches.
- Open `https://u10.teachearl.com/results`, enter the admin key. The key is remembered in that
  browser until you press **Log out**.
- Press **Make results public** when you want coaches to see the tallies on the vote page.
- Press ✕ next to a coach to delete their vote (lets them vote again).

## Changing the options

Edit the `OPTIONS` list at the top of `src/worker.js` and run `npm run deploy`. Existing
votes keep their ids, so renaming a label is safe; removing an option drops it from the tally.

## Local testing

```bash
cp .dev.vars.example .dev.vars        # sets ADMIN_KEY=change-me for local use
npm run db:init:local
npm run dev                           # http://localhost:8787
```

## Files

| Path | What |
| --- | --- |
| `wrangler.toml` | Worker name, D1 binding, custom domain |
| `schema.sql` | `votes` and `settings` tables |
| `src/worker.js` | API: options, me, vote, results, admin settings/delete |
| `public/index.html` | Vote page |
| `public/results.html` | Organizer page |
| `public/style.css` | Shared styles |
