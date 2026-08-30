# CLAUDE.md

Guidance for Claude when working in this repository.

> **Repo root is `bob-web/`.** The parent `bob/` directory on disk also holds `BOb-main/` (a New Relic nerdlet), `BOb2/`, `boob/` (docs + HTML prototypes) and loose `dashboard*.html` backups. Those are **not** part of this git repo and should not be read, edited, or staged from here. If a task concerns them, say so explicitly.

## Commit and PR rules

**No AI attribution anywhere.** Applies to every artifact that leaves this machine:

- Never add `Co-Authored-By: Claude <noreply@anthropic.com>` or any `Co-Authored-By` trailer naming an AI tool.
- Never add "Generated with Claude Code", "Made with AI", or any similar footer, badge, or sign-off.
- Never mention Claude, Anthropic, ChatGPT, Copilot, "AI-generated", "LLM", or "assistant" in: commit messages, branch names, PR titles, PR descriptions, issue titles or comments, release notes, changelog entries, or code comments.
- Write every commit as the repo author would. Imperative subject, `scope(area): summary` prefix, no emoji, no filler.
- **Commit language: English**, matching existing history (`feat(backend+dashboard): persist anomaly & text rules`).

Exception: `@anthropic-ai/sdk` is a real dependency of this app. Naming it in code, `package.json`, or a doc that explains the feature is fine. The ban is on attribution, not on the API.

## Sensitive data — never commit

Treat this repo as if it were public.

**Never stage:**
- `.env`, `.env.local` or any variant except `.env.local.example`.
- **`ANTHROPIC_API_KEY`** — it is server-side only and must never reach the browser bundle or the repo.
- Supabase service-role keys, JWT secrets, New Relic license or user keys, webhook signing secrets.
- Production dumps, or seed/fixture files containing real customer names, emails, phones, or account identifiers.
- Real conversation transcripts, real support tickets, or captured model responses containing customer data.
- Exports from production (CSV, JSON, XLSX), screenshots showing real records, or logs with real payloads.
- `Documentation/` holds Drive downloads and `.docx` material — verify each file before staging. Prefer keeping unreviewed drops out of git.

**Migrations (`supabase/migrations/`):**
- Schema, RLS policies, grants and functions are fine.
- Never hardcode a service-role key, a real tenant UUID, or seed rows with real people.

**Rules of thumb:**
- Every example value must be obviously fake: `user@example.com`, `sk-ant-xxx`, `Cliente Demo`.
- If a doc needs a real payload to be useful, keep the shape and redact the values.
- Never run `git add -A` or `git add .`. Stage explicit paths so nothing rides along.
- If unsure whether a file is sensitive, do not stage it — ask first.

## Commands

```bash
npm run dev     # Next dev server
npm run build   # production build
npm run start   # serve the build
npm run lint    # eslint
```

See `SETUP.md` for environment configuration.

## Architecture

**bob-web** is a Next.js App Router dashboard on Supabase, with a server-side Claude proxy. It renders the BOb simulator and persists rule configuration (thresholds, anomalies, text rules).

```
app/
  demo/          # the simulator surface
  login/  auth/  # Supabase auth flow
  api/           # route handlers — Claude proxy lives here
lib/             # supabase clients (@supabase/ssr), helpers
supabase/migrations/
proxy.ts
public/icon/
Documentation/   # design + handoff docs (not all reviewed for PII)
```

### Conventions

- All Claude calls go through a server route. The key is never exposed client-side — do not add a client-side SDK call for convenience.
- Rule persistence is the core of the app: thresholds, anomaly rules, and text rules all round-trip through Supabase. When adding a rule type, close the persistence path in the same change — the history shows this being fixed in phases and the gap is easy to reopen.
- Migrations are append-only. Never edit one that has run in production.
