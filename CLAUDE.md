# Life OS — Project Memory

## What this is
Antoine's personal life operating system: frictionless capture, projects, routines, habit/streak tracking, a knowledge library, and a personal CRM, in one app. Full feature spec and database schema live in `SCOPE.md` in this repo root — **read it before starting any work.**

## Stack
- Next.js (App Router) — frontend + API routes
- Supabase — Postgres, Auth, Realtime
- Vercel — hosting/deploy
- Tailwind CSS — styling
- Anthropic API (`claude-sonnet-5`) — powers the Coach feature, not needed until Phase 2

## Commands
- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run lint` — lint

## Next.js version note
This project was scaffolded with a recent Next.js release that may differ from training-data assumptions about APIs and conventions. See `AGENTS.md` — check `node_modules/next/dist/docs/` for the current API before writing App Router / routing code you're not sure about.

## How to work with Antoine
- Ask clarifying questions before building anything complex. Don't guess on an ambiguous spec and build past it — check first.
- He's willing to learn beginner-level Supabase/Vercel work but isn't a backend engineer. Explain setup steps plainly; don't assume CLI/DevOps fluency.
- Frictionless capture is the core value of the whole project. If a change adds friction to Quick Capture, flag it before building it.
- Build in the phase order from `SCOPE.md` §11. Don't jump ahead to later-phase features (CRM, notifications, Coach) while an earlier phase is unfinished.
- Whenever a feature is added or changed in the app (new fields, new CRUD operations, new entity types), also update BOTH Claude-facing surfaces so Claude and the in-app Coach have the same capability: the MCP connector (`lib/mcp/tools.ts`) AND the in-app Coach (`lib/coach/shared.ts` — its `TOOLS` array, `executeTool`, and `buildContext`). Don't treat this as optional polish; do it in the same change, not as a follow-up.
- The goal is that Claude and the Coach can do nearly everything Antoine can do in the app. The ONLY deliberate app-only exceptions (never expose to either surface) are the four irreversible/sensitive actions Antoine chose to keep manual: (1) domain deletion, (2) permanent trash purge (bypassing 30-day recovery), (3) knowledge-library folder deletion, (4) Gmail disconnect / account settings. Everything else — including trash-backed deletes and restore-from-trash — should be reachable by Claude and the Coach.

## Current phase
Phase 1: Next.js + Supabase setup, Domains/Projects/Tasks CRUD, Quick Capture, Today view, daily capacity check-in, habit logging with a basic streak counter. Full roadmap in `SCOPE.md` §11.
