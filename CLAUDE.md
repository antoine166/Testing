# Life OS — Project Memory

## What this is
Antoine's personal life operating system: frictionless capture, projects, routines, habit/streak tracking, a knowledge library, and a personal CRM, in one app. Full feature spec and database schema live in `SCOPE.md` in this repo root — **read it before starting any work.**

## Stack
- Next.js (App Router) — frontend + API routes
- Supabase — Postgres, Auth, Realtime
- Vercel — hosting/deploy
- Tailwind CSS — styling
- Claude MCP connector (`/api/mcp`) — Claude's access to the app, via Antoine's claude.ai subscription. **No Anthropic API key**: the in-app AI Coach was removed (July 2026, Antoine's call — it billed separately from his Max plan); don't rebuild it or reintroduce `ANTHROPIC_API_KEY` without asking.

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
- Whenever a feature is added or changed in the app (new fields, new CRUD operations, new entity types), also update the MCP connector (`lib/mcp/tools.ts`) so Claude has the same capability. Don't treat this as optional polish; do it in the same change, not as a follow-up. (This used to also cover the in-app Coach's `lib/coach/shared.ts` — that surface was removed with the Coach.)
- The goal is that Claude can do nearly everything Antoine can do in the app. The ONLY deliberate app-only exceptions (never expose to Claude) are the four irreversible/sensitive actions Antoine chose to keep manual: (1) domain deletion, (2) permanent trash purge (bypassing 30-day recovery), (3) knowledge-library folder deletion, (4) Google account connect/disconnect and account settings. Everything else — including trash-backed deletes and restore-from-trash — should be reachable by Claude.
- Model switching (Claude Code CLI sessions only, not the in-app Coach): he's on the Pro plan and wants to stay there until it makes sense to upgrade, so default to Sonnet and flag — don't switch unprompted — when a task would genuinely benefit from Opus (hard multi-layer debugging, architecture/design decisions) or Fable. He decides. Exception: if he says he'll be away for a while, just keep going on whatever model is active instead of pausing to ask, since that's more time- and token-efficient.

## Current phase
Phase 1: Next.js + Supabase setup, Domains/Projects/Tasks CRUD, Quick Capture, Today view, daily capacity check-in, habit logging with a basic streak counter. Full roadmap in `SCOPE.md` §11.
