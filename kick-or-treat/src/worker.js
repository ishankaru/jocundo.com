// Kick or Treat theme vote — Cloudflare Worker + D1.
// Routes:
//   GET  /api/options            the theme options
//   GET  /api/me                 the caller's saved vote (from cookie) + whether results are public
//   POST /api/vote               save or change a vote {name, team, choices:[3 ids]}
//   GET  /api/results            tallies; hidden unless results are public or an admin key is given
//   POST /api/admin/settings     {resultsPublic:boolean}   (admin)
//   DELETE /api/admin/votes/:id  remove one vote           (admin)
// Everything else is served from ./public.

export const OPTIONS = [
  { id: "uno",          emoji: "🟥🟨🟩🟦", label: "UNO Cards" },
  { id: "mib",          emoji: "🕶️👽",     label: "Men in Black" },
  { id: "cards",        emoji: "♠️♥️♦️♣️", label: "Playing Cards" },
  { id: "zombies",      emoji: "🧟⚽️",     label: "Zombie Soccer Players" },
  { id: "army",         emoji: "🪖⚽️",     label: "Army with Berets" },
  { id: "cops",         emoji: "🚔💰",     label: "Cops & Robbers" },
  { id: "sharks",       emoji: "🦈🛟",     label: "Sharks & Lifeguards" },
  { id: "stormtroopers",emoji: "⚪️⚫️",     label: "Stormtroopers" },
  { id: "minions",      emoji: "💛🍌",     label: "Minions" },
];
const OPTION_IDS = new Set(OPTIONS.map(o => o.id));
const PICKS = 3;
const COOKIE = "kot_voter";
const MAX_LEN = 60;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(request, env, url);
      } catch (err) {
        console.error(err);
        return json({ error: "Something went wrong. Please try again." }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};

async function api(request, env, url) {
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method.toUpperCase();

  if (method === "GET" && path === "/api/options") {
    return json({ options: OPTIONS, picks: PICKS });
  }

  if (method === "GET" && path === "/api/me") {
    const voterId = getCookie(request, COOKIE);
    const resultsPublic = await isResultsPublic(env);
    const total = await countVotes(env);
    let vote = null;
    if (voterId) {
      const row = await env.DB.prepare(
        "SELECT name, team, choices, updated_at FROM votes WHERE voter_id = ?"
      ).bind(voterId).first();
      if (row) vote = { name: row.name, team: row.team, choices: JSON.parse(row.choices), updatedAt: row.updated_at };
    }
    return json({ vote, resultsPublic, totalVotes: total });
  }

  if (method === "POST" && path === "/api/vote") {
    return saveVote(request, env);
  }

  if (method === "GET" && path === "/api/results") {
    const admin = isAdmin(request, env, url);
    const resultsPublic = await isResultsPublic(env);
    const total = await countVotes(env);
    if (!admin && !resultsPublic) {
      return json({ hidden: true, totalVotes: total }, 200);
    }
    const { results } = await env.DB.prepare(
      "SELECT voter_id, name, team, choices, created_at, updated_at FROM votes ORDER BY updated_at DESC"
    ).all();
    const tally = Object.fromEntries(OPTIONS.map(o => [o.id, 0]));
    for (const r of results) for (const id of JSON.parse(r.choices)) if (id in tally) tally[id]++;
    const ranked = OPTIONS
      .map(o => ({ ...o, votes: tally[o.id], pct: total ? Math.round((tally[o.id] / total) * 100) : 0 }))
      .sort((a, b) => b.votes - a.votes || a.label.localeCompare(b.label));
    const body = { hidden: false, resultsPublic, totalVotes: total, results: ranked };
    if (admin) {
      body.voters = results.map(r => ({
        id: r.voter_id, name: r.name, team: r.team, choices: JSON.parse(r.choices),
        createdAt: r.created_at, updatedAt: r.updated_at,
      }));
    }
    return json(body);
  }

  if (path.startsWith("/api/admin/")) {
    if (!isAdmin(request, env, url)) return json({ error: "Admin key required." }, 401);

    if (method === "POST" && path === "/api/admin/settings") {
      const body = await readJson(request);
      if (typeof body?.resultsPublic !== "boolean") return json({ error: "resultsPublic must be true or false." }, 400);
      await env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES ('results_public', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).bind(body.resultsPublic ? "true" : "false").run();
      return json({ ok: true, resultsPublic: body.resultsPublic });
    }

    const del = path.match(/^\/api\/admin\/votes\/([A-Za-z0-9_-]+)$/);
    if (method === "DELETE" && del) {
      const r = await env.DB.prepare("DELETE FROM votes WHERE voter_id = ?").bind(del[1]).run();
      return json({ ok: true, deleted: r.meta.changes });
    }
  }

  return json({ error: "Not found." }, 404);
}

async function saveVote(request, env) {
  const body = await readJson(request);
  if (!body) return json({ error: "Send JSON." }, 400);

  const name = clean(body.name);
  const team = clean(body.team);
  if (!name) return json({ error: "Please enter your name." }, 400);
  if (!team) return json({ error: "Please enter your team." }, 400);

  const choices = Array.isArray(body.choices) ? body.choices.map(String) : [];
  if (choices.length !== PICKS) return json({ error: `Pick exactly ${PICKS} themes.` }, 400);
  if (new Set(choices).size !== PICKS) return json({ error: "Each pick must be a different theme." }, 400);
  if (!choices.every(id => OPTION_IDS.has(id))) return json({ error: "Unknown theme option." }, 400);

  const nameKey = `${norm(name)}|${norm(team)}`;
  const cookieId = getCookie(request, COOKIE);
  const choicesJson = JSON.stringify(choices);

  // 1) Same browser (cookie) → update that row.
  let voterId = null;
  if (cookieId) {
    const mine = await env.DB.prepare("SELECT voter_id FROM votes WHERE voter_id = ?").bind(cookieId).first();
    if (mine) voterId = cookieId;
  }

  // 2) Same coach + team already voted (new device or cleared cookies) → treat as the same voter.
  const sameCoach = await env.DB.prepare("SELECT voter_id FROM votes WHERE name_key = ?").bind(nameKey).first();
  if (sameCoach && voterId && sameCoach.voter_id !== voterId) {
    return json({ error: `${name} (${team}) has already voted from another device. Use the same name and team you voted with before, or ask the organizer to reset it.` }, 409);
  }
  if (!voterId && sameCoach) voterId = sameCoach.voter_id;

  let status = "updated";
  if (voterId) {
    await env.DB.prepare(
      "UPDATE votes SET name = ?, team = ?, name_key = ?, choices = ?, updated_at = datetime('now') WHERE voter_id = ?"
    ).bind(name, team, nameKey, choicesJson, voterId).run();
  } else {
    voterId = crypto.randomUUID();
    status = "created";
    await env.DB.prepare(
      "INSERT INTO votes (voter_id, name, team, name_key, choices) VALUES (?, ?, ?, ?, ?)"
    ).bind(voterId, name, team, nameKey, choicesJson).run();
  }

  const res = json({ ok: true, status, vote: { name, team, choices } }, status === "created" ? 201 : 200);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  res.headers.append("Set-Cookie",
    `${COOKIE}=${voterId}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`);
  return res;
}

// ---- helpers ----
async function isResultsPublic(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'results_public'").first();
  if (row) return row.value === "true";
  return String(env.RESULTS_PUBLIC || "false") === "true";
}
async function countVotes(env) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM votes").first();
  return row?.n ?? 0;
}
function isAdmin(request, env, url) {
  const key = env.ADMIN_KEY;
  if (!key) return false;
  const auth = request.headers.get("Authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : url.searchParams.get("key");
  return !!given && safeEqual(given, key);
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}
async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}
function clean(v) {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MAX_LEN) : "";
}
function norm(v) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
