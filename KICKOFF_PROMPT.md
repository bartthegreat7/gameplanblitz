# Claude Code kickoff prompt — GameplanBlitz

Paste the block below as your first message to Claude Code, run from inside the repo
(the one that already deploys to GitHub Pages, with `index.html`, `worker.js`, and
`CLAUDE.md` at the root).

---

You are a senior front-end engineer and software architect. We are turning the
GameplanBlitz prototype into a production React + Vite app deployed to GitHub Pages.

**Before doing anything:** read `CLAUDE.md` in full, then read `index.html` (the
working prototype — it is the behavioral spec) and `worker.js` (the news backend).
`CLAUDE.md` is the source of truth and the agreed plan; follow it, and **keep it
updated in the same commits** as you work (features, architecture, data quirks,
and the Status & changelog section).

**Hard constraints**
- Stack is already chosen in CLAUDE.md (React + Vite + TS + Tailwind v4 + TanStack
  Query + React Router HashRouter + Zustand + lucide-react + Vitest + idb-keyval).
  Don't add dependencies beyond these without noting why in CLAUDE.md.
- This is a GitHub Pages **project** site: set Vite `base: '/<repo>/'` (detect the
  repo name from the git remote), use HashRouter, and deploy via a GitHub Actions
  workflow. Pages source = GitHub Actions.
- Keep the Cloudflare Worker as the news API. The app reads `VITE_NEWS_API`. The
  browser must never fetch publisher RSS directly.
- No secrets in the client. Preserve the read-only nature — never write to Sleeper.
- Match the prototype's formulas exactly (scoring, optimal lineup, win probability,
  player value, Edge, FAAB) — they're documented in CLAUDE.md §6. Keep `index.html`
  as `legacy/index.html` until parity is verified.

**Work in phases, committing after each, and update CLAUDE.md as you go:**

1. **Scaffold.** Vite + TS + Tailwind v4 + the deps above. Set `base`, HashRouter,
   theme tokens (navy/slate/white + mint; light & dark via CSS variables), the
   AppShell (desktop sidebar + mobile bottom nav), and the GitHub Actions deploy
   workflow. Verify a trivial page builds and deploys.
2. **Data layer.** `lib/sleeper.ts` (typed, players cached in IndexedDB w/ TTL),
   `lib/scoring.ts`, `lib/lineup.ts`, `lib/fantasycalc.ts`, `lib/news.ts`, and the
   React Query hooks. Unit-test the pure logic against known values from the prototype.
3. **Connect flow + shell nav** (username → league picker, persisted via Zustand).
4. **Port features** to parity, each with real loading/empty/error states and
   responsive layouts, in this order: Game Day, Lineup Check, The Edge, Waiver Wire,
   Waiver Bids, Standings, Roster, Player Value, Trade Machine, News Hub.
5. **Players + Player detail routes**, including per-player news matched from the hub.
6. **Polish + a11y:** keyboard nav, focus states, reduced-motion, skeletons matched
   to layouts, no layout shift. Reusable Modal/Drawer.
7. **Verify:** run `tsc --noEmit`, lint, `vitest run`, and `vite build`. Report
   results, the feature-parity checklist state, and any feeds/sources unavailable.

**Acceptance for Phase 1:** every item in CLAUDE.md §8 works against a live Sleeper
league on both desktop and phone widths; type-check, lint, tests, and build all pass;
the Actions workflow deploys to Pages; CLAUDE.md reflects reality.

Stop after the scaffold step and show me the plan + file tree before going further.
