# Interview Intuition Trainer

## Project context
- Daily puzzle game inspired by Wordle, for software engineering interview intuition prep
- V1 scope: 10 hand-authored puzzles, web only, no AI generation in the content pipeline. Need to assist in creating these puzzle json files
- V2 scope: 
- Stack: Next.js + TypeScript + Tailwind + Supabase + Vercel
- Versions: Utilize most stable versions for the above tech stack, minimizing recent security and using stable builds that have been verified
- Optimize for shipping fast, but priotize perfection right after shipping fast.

## Code style
- TypeScript strict mode. No `any` unless explicitly justified in a comment.
- Tailwind only. No CSS-in-JS, no styled-components, no UI libraries.
- Functional React components with hooks. No class components.
- Server components by default; mark client components with "use client" explicitly.
- Ensure no exploits can be used to make the system you are coding explitable. 
- Minimize boiler plate code and be concise with your logic. 

## Workflow
- Never run `npm install <package>` without confirming with me first. Supply chain hygiene matters.
- After each session add and commit your changes to github repository
- After writing your initial logic for any changes, test the application and look for any errors. The test can be simple as running the application and looking for errors in console.
- After writing code, give a brief explanation of the changes made and intuition required to understand the changes
- Always pin exact versions in package.json. No `^` or `~`.

## Security constraints (HARD REQUIREMENTS)
- npm install scripts are disabled globally. If a package needs them, flag it before installing.
- Commit package-lock.json. Use `npm ci` not `npm install` when possible.
- Never commit secrets. Use .env.local for local dev, never .env.

## Data model context
- Puzzle data lives in /puzzles/*.json files, source-controlled.
- Postgres schema is in /db/schema.sql.
- Puzzle JSON shape: see /puzzles/puzzle-001.json as the canonical example.

## Project structure
- /app — Next.js app router pages and API routes
- /lib — shared utilities, Supabase client, types
- /puzzles — source-of-truth JSON puzzles
- /db — SQL schema and migrations

## Gotchas
- Supabase RLS policies must be set on every new table or queries silently return nothing.
- Vercel deployment uses `npm ci`, so package-lock.json MUST be committed.