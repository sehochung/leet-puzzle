-- Interview Intuition Trainer — Postgres schema (Supabase).
--
-- Per-visitor puzzle progress. Identity comes from Supabase Anonymous Sign-Ins, so
-- every visitor has an auth.uid() even without creating an account; RLS keys every
-- row to that uid. Apply in the Supabase SQL editor (or `supabase db push`).
--
-- Gotcha (CLAUDE.md): RLS MUST be enabled or queries silently return nothing. It is
-- enabled below and the policies restrict every row to its owner.

create table if not exists public.progress (
  user_id          uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  puzzle_id        text        not null check (puzzle_id ~ '^puzzle-[0-9]{3}$'),
  completed        boolean     not null default false,
  picks            smallint[]  not null default '{}',  -- the player's per-round pick (0..3), in order
  first_pick_score smallint    not null default 0 check (first_pick_score between 0 and 5),
  tests_passed     smallint    not null default 0,
  tests_total      smallint    not null default 0,
  completed_at     timestamptz not null default now(),
  primary key (user_id, puzzle_id)
);

alter table public.progress enable row level security;

-- Owner-only access. Anonymous sessions are authenticated sessions, so `authenticated`
-- is the correct role; auth.uid() pins each row to its creator. No delete policy: a
-- player can re-upsert their row but never read or write anyone else's.
create policy "progress_select_own" on public.progress
  for select to authenticated using (user_id = auth.uid());

create policy "progress_insert_own" on public.progress
  for insert to authenticated with check (user_id = auth.uid());

create policy "progress_update_own" on public.progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
