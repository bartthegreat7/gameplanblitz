# CLAUDE.md — GameplanBlitz

> **Read this first, every session.** It is the single source of truth for this
> project. **Keep it updated:** whenever you add a feature, change the
> architecture, learn a data-source quirk, or finish a phase, edit the relevant
> section and the "Status & changelog" at the bottom in the same commit. Treat an
> out-of-date CLAUDE.md as a bug.

## 1. What this is

GameplanBlitz is a personal fantasy-football intelligence dashboard. It reads a
user's Sleeper league live and turns it into actionable advice: matchup
projections, lineup fixes, waiver/free-agent edges, FAAB bids, fair trades, and a
multi-source fantasy news hub. Read-only — it never writes to anyone's league.

- **Owner/user:** single-user to start (Sleeper username entered in the UI). No auth, no accounts.
- **Hosting:** GitHub Pages (static) for the app + a Cloudflare Worker for the news API.
- **Baseline to port from:** `index.html` at the repo root is a working single-file
  prototype. It is the behavioral spec — match its formulas and UX, then improve
  the structure, responsiveness, and polish. Do not delete it until parity is
  verified; keep it as `legacy/index.html` for reference.

## 2. Goals (in order)

1. **Feature parity** with `index.html`, rebuilt as a proper React/Vite app,
   fully responsive (desktop multi-column + sidebar; phone single-column + bottom nav).
2. Clean architecture, typed data layer, real loading/empty/error states, light+dark.
3. Only then: new features (3rd-party article analysis, team-vs-team analytics,
   deeper player-value models). See "Roadmap".

## 3. Tech stack (chosen — all free)

- **React 18 + Vite + TypeScript** (static build).
- **Tailwind CSS v4** + CSS variables for theming (navy/charcoal/white + electric-blue accent (`--accent`); light & dark).
- **TanStack Query (React Query)** for all server data (caching, refetch, states).
- **React Router `HashRouter`** — required for GitHub Pages project sites (avoids 404 on refresh/deep-link).
- **Zustand** for app state (username, selected leagueId, theme). Persist to localStorage.
- **lucide-react** for icons.
- **Recharts** for charts (Phase 2 analytics).
- **Vitest + @testing-library/react** for tests.
- **idb-keyval** for caching the large Sleeper players file in IndexedDB.
- Avoid adding dependencies beyond these without a note here explaining why.

## 4. Deploy / GitHub Pages rules (easy to get wrong)

- This is a **project Pages** site, so set Vite `base: '/<repo-name>/'` in
  `vite.config.ts`. Detect the repo name from the remote; do not hardcode a wrong one.
- Use **HashRouter**, not BrowserRouter (no SPA fallback on Pages).
- Deploy with **GitHub Actions** (`actions/configure-pages`, `actions/upload-pages-artifact`,
  `actions/deploy-pages`) building from `main`. Pages source = "GitHub Actions".
- Config via Vite env vars (`import.meta.env.VITE_*`), baked at build time. These
  are **not secrets** (Sleeper/FantasyCalc need no keys; the Worker URL is public).
  - `VITE_NEWS_API` = the Cloudflare Worker base URL (e.g. `https://gameplanblitz-news.<you>.workers.dev`).
- Never ship secrets to the client. There are none today; keep it that way.

## 5. Data sources (and their quirks)

### Sleeper API — `https://api.sleeper.app/v1` (public, no auth, CORS-open)
- `GET /state/nfl` → `{ season, week, display_week, season_type }`. Use for current week.
- `GET /user/{username}` → `{ user_id, ... }`.
- `GET /user/{user_id}/leagues/nfl/{season}` → leagues[]. If empty for current season, try `season-1`.
- `GET /league/{id}` → settings, `scoring_settings`, `roster_positions`, `season`,
  `settings.playoff_week_start`, `settings.playoff_teams`, `settings.num_teams`,
  `settings.waiver_budget`, `settings.waiver_type`.
- `GET /league/{id}/rosters` → rosters[]: `roster_id`, `owner_id`, `co_owners`,
  `players[]`, `starters[]`, `settings.{wins,losses,ties,fpts,fpts_decimal,fpts_against,fpts_against_decimal,waiver_budget_used}`.
- `GET /league/{id}/users` → users[]: `user_id`, `display_name`, `avatar`, `metadata.team_name`.
- `GET /league/{id}/matchups/{week}` → per roster: `roster_id`, `matchup_id`,
  `points`, `starters[]`, `players[]`, `starters_points[]`. Group by `matchup_id` to find the opponent.
- `GET /players/nfl` → **~5 MB** object keyed by player_id. **Cache in IndexedDB**
  (idb-keyval) with a ~24h TTL; never localStorage (too small). Defense `player_id`
  is the team code (e.g. `"BUF"`) with `position: "DEF"`.
- `GET https://api.sleeper.app/projections/nfl/{season}/{week}?season_type=regular`
  → projections. Response may be an **array** of `{player_id, stats}` or an object
  keyed by player_id — normalize both to `Map<player_id, stats>`.
- `GET https://api.sleeper.app/stats/nfl/{season}?season_type=regular`
  → season stat totals keyed by player_id, includes `gp` (games played) for PPG.
- Avatars: `https://sleepercdn.com/avatars/thumbs/{avatar}`.
- Headshots: `https://sleepercdn.com/content/nfl/players/{player_id}.jpg`;
  DEF logo: `https://sleepercdn.com/images/team_logos/nfl/{team}.png`. Always provide an initials fallback on image error.

### FantasyCalc — `https://api.fantasycalc.com/values/current` (public, CORS-open)
- `?isDynasty=false&numQbs={qbs}&numTeams={teams}&ppr={ppr}` → rows with
  `player.sleeperId`, `value`, `overallRank`. Map `sleeperId → value`.
- `ppr` = `scoring_settings.rec` (default 1). `qbs` = count of `QB`+`SUPER_FLEX` starting slots (min 1). `teams` = `num_teams`.
- Used by the Trade Machine for fairness pricing. Degrade gracefully if it fails.

### News — the project's own **Cloudflare Worker** (`worker.js` in repo)
- `GET {VITE_NEWS_API}/api/news?q=&publisher=&category=&limit=&offset=`
- Response: `{ updated, total, count, sources[], categories[], publishers[], articles[] }`.
- `article`: `{ id, title, url, publisher, source_id, author, ts, published, excerpt, image, category, tags[], also[] }`.
- Feeds live **server-side** in the Worker (CORS + caching + cron). The browser
  must never fetch publisher RSS directly — it can't (no CORS) and shouldn't.
- Integrated publishers: **FantasyPros**, **RotoWire** (NFL news + featured articles).
  Pending (do not fake): RotoBaller (partner feed — apply), NBC Rotoworld / Footballguys / 4for4 / Dynasty Nerds (paywalled/unconfirmed).
- **Content policy:** metadata + short excerpt + thumbnail + link only. No full
  articles, no paywalled content, no scraping. Every card links to the publisher.
  RotoWire feeds are licensed "for personal websites"; non-commercial use only.

## 6. Core logic (port exactly from `index.html`, then keep here)

- **Scoring:** `points(stats, scoring) = Σ stats[k] * (scoring[k] || 0)` over numeric keys.
  Works for both projections and actual stats. Fallback to `pts_ppr`/`pts_half_ppr`/`pts_std` if the sum is 0.
- **Optimal lineup:** greedily fill the **strict** slots first (QB/RB/WR/TE/K/DEF),
  then flex slots (FLEX, SUPER_FLEX, etc.), each by highest projection, no reuse.
  Slot eligibility map lives in `index.html` — copy it.
- **Projected score:** sum of optimal-lineup starter projections in league scoring.
- **Win probability:** `1 / (1 + exp(-(myProj - oppProj) / 28))`.
- **Player value:** `0.5 * seasonPPG + 0.5 * weekProjection` (both league-scored); PPG = seasonStats / `gp`.
- **The Edge:** best free agent per position vs each starter; upgrade if `FA_proj >= starter_proj + 1`.
- **FAAB bid suggestion:** share of remaining budget scaled by how much a player beats your weakest starter at that position.
- **News → player matching:** match article title/excerpt against roster players' full
  names (and last names length ≥ 5) using Sleeper ids already loaded.

## 7. Target architecture

```
src/
  lib/
    sleeper.ts        # typed Sleeper client + players IndexedDB cache
    fantasycalc.ts    # trade-value client
    news.ts           # Worker /api/news client
    scoring.ts        # points(), projection helpers
    lineup.ts         # slot eligibility, optimalLineup()
    format.ts         # relTime, numbers, names, avatars
    evidence.ts       # Evidence + documented confidence rubric (rateConfidence)
    analytics/        # explainable models: history, volatility, usage, matchup, schedule,
                      #   lineupPlan (exact optimizer), lineupAnalysis (wires it to the model)
  hooks/              # useState wrappers over React Query: useLeague, useRosters,
                      # useMatchups, useProjections, useSeasonStats, useFantasyCalc, useNews
  store/              # Zustand: username, leagueId, theme, collapsed sections, bookmarks/read
  components/
    layout/           # AppShell, Sidebar (desktop), BottomNav (mobile), ThemeToggle
    ui/               # Card, Pill, Avatar, Skeleton, EmptyState, ErrorState, Modal, Drawer, Chip
    cards/            # GameDay, LineupCheck, Edge, TradeMachine, WaiverWire, WaiverBids,
                      # Standings, Roster, PlayerValue, NewsHub
  routes/             # Connect (username/league), Dashboard, News, Standings, Players, PlayerDetail, Settings
  App.tsx, main.tsx, index.css
```

- **Responsive:** desktop = persistent collapsible sidebar + multi-column dashboard grid;
  mobile = bottom nav + single column (mirror the prototype's stacked cards). One codebase, breakpoints only.
- **UI states everywhere:** loading (skeletons matched to layout), empty, error, and
  permission/denied where relevant. No bare spinners for content areas.
- Keep components presentational; data in hooks; pure logic in `lib/` with unit tests.

## 8. Feature parity checklist (Phase 1 — port these)

- [x] Connect flow: Sleeper username → league picker, persisted (Zustand+localStorage).
- [x] Game Day: matchup, projected scores, win probability, position battles.
- [x] Lineup Check: empty slots, injured/out starters, bench-over-starter upgrades.
- [x] The Edge: starters vs best free agents; upgrades + bust watch.
- [x] Trade Machine: FantasyCalc-fair deals that raise weekly starters; copy offer.
- [x] Waiver Wire: top free agents by projection.
- [x] Waiver Bids: FAAB budget + suggested bids (handle rolling-waiver leagues too).
- [x] Standings: W-L, PF, PA, playoff cut line.
- [x] Roster: your players, starters, injuries, projections.
- [x] Player Value: blended ranking.
- [~] News & Analysis hub: Worker-backed, filters (category/publisher/search/my-roster/saved), bookmarks, mark-read, states.
- [x] Settings: theme, refresh, sign out, news endpoint note.


_Legend: [x] built + tested against mocked Sleeper/FantasyCalc responses; [~] built against the §5 contract but **unverified against the real Worker** (`worker.js` is not in the repo, `VITE_NEWS_API` unset). Nothing has been checked against a live Sleeper league by a human yet._

## 9. Conventions

- TypeScript strict. No `any` in `lib/`; type the Sleeper responses in `lib/sleeper.ts`.
- Prettier + ESLint defaults; keep imports ordered.
- Tailwind for layout; CSS variables (in `index.css` `:root` + dark) for theme tokens — no hardcoded hex in components.
- Pure functions in `lib/` have Vitest tests. Components get smoke/interaction tests for stateful ones.
- Commit messages: short imperative; update this file in the same commit when context changes.

## 10. Roadmap (Phase 2+, brainstorm later — do NOT start until Phase 1 ships)

- More third-party article sources (RotoBaller partner feed, others once licensed/confirmed).
- Team-vs-team analytics: positional advantage, schedule strength, rest-of-season outlook.
- Deeper player value: trend lines, buy-low/sell-high signals, strength-of-schedule adjustments.
- Monte Carlo playoff odds + playoff-week lineup planner (Sleeper gives the remaining schedule).
- Keeper planner, PWA install, shareable read-only links.

## 11. Status & changelog

- _(Claude Code: append dated entries here as you work. Example:)_
- 2026-11-11: Repo baseline = single-file `index.html` prototype + `worker.js` news backend. Starting React/Vite migration, Phase 1.
- 2026-11-11: Working in the prototype `index.html` directly (React migration paused: no npm on dev machine, `worker.js` not in repo). Added light/dark theme toggle (CSS variable tokens, `data-theme`, saved in `huddle.theme`), two-column desktop layout, keyboard-accessible card headers, IndexedDB cache for the Sleeper players file (24h TTL), projection-missing/failed notices, and a News & Injuries card (roster injury report from Sleeper; article feed activates when `NEWS_API` is set — news work is on hold). Fixed header double-escaping and sped up Trade Machine lineup math.
- 2026-11-11: **Phase 1 step 1 (scaffold) done on branch `react-scaffold`.** Vite 8 + React 18 + TS + Tailwind v4 + TanStack Query + HashRouter + Zustand; AppShell (desktop sidebar / mobile bottom nav), light/dark tokens in `src/index.css`, placeholder routes, Vitest smoke test, `.github/workflows/deploy.yml` (triggers on `master`). Prototype moved to `legacy/index.html`. `tsc`, eslint, vitest and `vite build` all pass. Dev-machine quirks: the repo path contains `&`, which breaks `npm run` shims in cmd.exe — run tools via `node node_modules/<pkg>/...` locally (CI on Linux is unaffected); `npm` lives in `C:\Program Files\nodejs` and may not be on the Git Bash PATH. **Do not merge to `master` until Pages source is switched to "GitHub Actions"** — Pages currently serves the repo root from `master`, which would then be the unbuilt Vite `index.html`.
- 2026-11-11: **Phase 1 steps 2-7 done on `react-scaffold`.** Data layer (`src/lib/`: sleeper, scoring, lineup, model, insights, fantasycalc, news, format) with Vitest tests (formulas ported 1:1 from legacy); hooks (`useSession`, `useLeagueData` -> `LeagueGate`, `useNews`); Zustand store now holds username/leagueId/collapsed/bookmarks/read; Connect flow; all 10 dashboard cards + Standings/Players/PlayerDetail/News/Settings routes with loading/empty/error states; reusable Modal/Drawer (`ui/Overlay`), skip link, focus-visible, reduced-motion. Required data (league, rosters, users, players) errors out; projections/stats/FantasyCalc/news soft-fail into `flags` + inline notices. Verified: tsc, eslint, vitest (64 tests incl. a mocked-API integration suite, mutation-checked), `vite build`, and headless-Edge screenshots of desktop+phone in light+dark against a mocked league. **Not done / open:** no real-league human check; no contrast audit; news hub untested vs real Worker; `legacy/index.html` stays until parity is confirmed; Pages source must be switched to GitHub Actions before merging to `master`.
- 2026-11-11: **Intelligence platform, Phases 0-1** (branch `intelligence-platform`, plan in the session brief). *Phase 0:* palette -> electric-blue accent on navy/charcoal (`mint` tokens renamed `accent`); contrast audit as a test (`theme.contrast.test.ts`, WCAG AA both themes; it caught and fixed light `ink-3`); collapsible sidebar (persisted); shared `DataTable` (search/sort/aria-sort), `RangeBar`, `FreshnessBadge`, `ConfidenceBadge`, `EvidenceList`; Sleeper clients for projection/weekly stat rows (carry `opponent`, `team`, provider `company`), NFL schedule, cached weekly history (IndexedDB, 7d). *Phase 1:* **Lineup Optimizer** (`/lineup`). Facts verified against live Sleeper today: weekly stats rows have opponent + snap counts (`off_snp`/`tm_off_snp`); schedule has bye teams and status (`pre_game`/`complete` only observed; anything else is treated as started); projections are point estimates only (**no floor/ceiling anywhere**: an early probe claimed otherwise, a regex false-positive on `pts_std`). Methods: exact Hungarian assignment (greedy fill provably loses points when flex slots overlap: regression-tested, plus brute-force + property tests), locked games never moved, Out/bye never recommended, equal ties keep current slots; range = projection +/- 1.28 x week-to-week sd shrunk toward the position (documented, testable, independence assumption stated); matchup (defense vs position) is **context only, never added** because Sleeper projections may already include it; confidence from a fixed rubric (`CONFIDENCE_RUBRIC`); new starters are judged against the player they displace (`pairDisplaced`) so reshuffles read correctly. Verified: tsc, eslint, vitest (180 tests, mutation-checked: a mutation check found and closed a gap in the lock test), build, headless-Edge screenshots (desktop/phone, light/dark, collapsed sidebar). **Not verified:** nothing run against a real league; `traded_picks`/keepers/tiebreaker fields still unprobed (need a real league); live in-game status lag (schedule may say `pre_game` after kickoff). **Next:** Phase 2 Waiver Sniper, then Trade War Room, Scouting, Playoff Simulator, Keeper, Game Day, GM, News (blocked on Worker).
- 2026-11-11: **Intelligence platform, Phase 2: Waiver Wire Sniper** (`/waivers`; branch `waiver-sniper`). Verified live today: Sleeper publishes **future-week projections** (weeks +1..+8 return ~9.4k rows), so adds are valued over the next 3 weeks (`HORIZON_WEEKS`); depth charts exist for QB/RB/TE only (**WR depth is split by alignment LWR/RWR/SWR and is not used**); trending add/drop feeds work; the transactions endpoint returns a JSON array (shape parsed defensively, **not yet seen with real claim data**: FAAB-from-history is untested against a real league). Method: per-week exact lineup optimizer with vs without the player (and the best drop) over the horizon; Out = 0 this week only, IR/PUP/Sus/NA = 0 throughout; **the schedule is authoritative for byes** (no game, no points; a week with no schedule data flags nobody); started games lock both the add and the drop for the current week; keepers, IR/taxi and started players are never suggested as drops; open roster spot = no drop. Signals (snap share, scoring form, depth chart, Sleeper-wide trending) are shown as context and only qualify a low-projection player as a speculative stash (2+ positives); ranking is by net lineup gain. FAAB: winning bids from this season's completed waiver claims (median..p75, p75..max for priority adds, scaled within the band by upgrade size); otherwise a labeled rule of thumb (gain/20 of budget, 2-25%); whole dollars, capped at budget. Each add is valued on its own, so several recommendations may share a drop (the page says so). Phone nav: 4 primary tabs + a **More** sheet. Verified: tsc, eslint, vitest (233; all 13 targeted mutations caught), build, browser screenshots (desktop dark, phone light, More sheet). The browser pass found and fixed: identical bids for every priority add, byes not zeroed from the schedule, and missing independence note. **Open:** nothing run against a real league; trending is Sleeper-wide popularity, not value; depth charts may lag. **Next:** Trade War Room.
