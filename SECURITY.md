# Security Policy

## Threat model

The puzzle JSON under `/puzzles` is **public by design** — it is the game's content and
ships to the browser. User play data (scores, streaks, progress) is **private** and must be
protected per-user with Supabase Row Level Security, so one user can never read or write
another user's rows. The Supabase **service role key** is the highest-value secret: it
bypasses RLS entirely, so it must never enter the client bundle, the `NEXT_PUBLIC_`
namespace, or git history.

## Secret hierarchy — what lives where

- **Local dev:** `.env.local` (gitignored). Copy `.env.example` and fill in real values.
- **Production:** Vercel project environment variables. `NEXT_PUBLIC_*` are exposed to the
  browser; `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- **CI (when it exists):** GitHub Actions encrypted secrets. Never echo secrets into logs.

Never commit `.env` or any real key. Only `.env.example` (empty values) is tracked.

## Reporting a vulnerability

Email **seho@example.com**, or open a private GitHub Security Advisory ("Report a
vulnerability" under the repository's **Security** tab). Please do not file public issues
for security reports. We aim to acknowledge within a few days.
