# Voyage Companion: build report

This folder is the record of how the app was built, on 1 October 2026, for a 45-minute in-person pirate team game. The app itself lives in `voyage-companion/`. Setup steps for running it are in the project [README](../README.md). These files are the build notes: what each phase delivered, the decisions that were locked in, and how it was tested.

## Files

| File | What it covers |
| --- | --- |
| [01-overview.md](01-overview.md) | What the app is, the stack, and the rules that shaped the code |
| [02-phase-1-foundation.md](02-phase-1-foundation.md) | Next.js, Supabase, login, QR codes, empty role screens |
| [03-phase-2-posts-and-teams.md](03-phase-2-posts-and-teams.md) | Jobs, sales, undo, Double Profit, boat finished |
| [04-phase-3-raids.md](04-phase-3-raids.md) | Raid codes, dice, Shield, Sword, immunity |
| [05-phase-4-events-and-mc.md](05-phase-4-events-and-mc.md) | World events, price dial, the full MC panel |
| [06-phase-5-scoring-and-tv.md](06-phase-5-scoring-and-tv.md) | One score formula, the TV, the final reveal |
| [07-phase-6-hardening.md](07-phase-6-hardening.md) | Rehearsal, the deadlock fix, load check, README |
| [08-decisions.md](08-decisions.md) | Answers that were agreed before coding, and later design choices |
| [09-testing-and-local-setup.md](09-testing-and-local-setup.md) | How to run it locally, the demo logins, and the test scripts |

## Outcome

The six planned phases are finished. At the end of Phase 6:

- `scripts/scenario-test.ts` passed **127 of 127** checks.
- `scripts/load-check.ts` passed. All five posts acted at once, and every team's gold matched the action log.
- Type check (`npx tsc --noEmit`) and lint (`npx eslint .`) were clean.
- The local demo game `DEMOGM` was reset to a fresh setup.
