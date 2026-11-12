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
- **Tailwind CSS v4** + CSS variables for theming (deep-navy command-center palette: bg #080F20, sidebar #070D1C, cards #151E31/#1B2740, active #1C3158, accent blue #60A5FA, purple #A78BFA, positive #34D399; matching light theme; every text/background pair is checked by `theme.contrast.test.ts`).
- **TanStack Query (React Query)** for all server data (caching, refetch, states).
- **React Router `HashRouter`** — required for GitHub Pages project sites (avoids 404 on refresh/deep-link).
- **Zustand** for app state (username, selected leagueId, theme). Persist to localStorage.
- **lucide-react** for icons. Weather conditions use full-color "Weather Icons" art by Bas Milius (MIT, static fill variant, 8 SVGs vendored in `src/assets/weather/` with LICENSE.txt; no runtime dependency).
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
  → season stat totals, includes `gp` (games played) for PPG. **Returns an array of rows** `{player_id, stats, ...}` (verified 2026-11-12;
  the app read it as an object until then, so season PPG was silently empty). `getSeasonStats` normalizes both shapes.
- Weekly stats rows (`/stats/nfl/{season}/{week}`) carry `rec_tgt`, `rush_att`, `pass_att`, red-zone `rec_rz_tgt`/`rush_rz_att`/`pass_rz_att`,
  `off_snp`/`tm_off_snp`, and `pts_ppr`/`pts_half_ppr`/`pts_std`. **No route participation.** Past weeks' projections are still served
  (used for backtests). Player `practice_participation` exists but is essentially never filled (1 player of ~11k): not usable.
  The NFL schedule has `date`, `home`, `away`, `status` only: **no kickoff time and no venue** (neutral-site games are not identified).
- FantasyCalc rows also carry `trend30Day` (the provider's 30-day value change).

### Weather — Open-Meteo `https://api.open-meteo.com/v1/forecast` (free, no key, CORS `*`, CC BY 4.0: attribute "Weather data by Open-Meteo.com"; non-commercial use)
- Hourly temperature, precipitation probability/amount, snowfall, wind, gusts, WMO weather code, up to 16 days, in the stadium's time zone.
- Stadium table: `src/lib/weather/stadiums.ts` (32 teams; coordinates approximate; roof: open / dome / retractable / canopy).
  Retractable roof status is never assumed. Games are assumed at the home team's stadium (Sleeper has no venue). No kickoff time
  from Sleeper, so the forecast covers the game day 12 PM - 11 PM local window.
- Avatars: `https://sleepercdn.com/avatars/thumbs/{avatar}`.
- Headshots: `https://sleepercdn.com/content/nfl/players/{player_id}.jpg`;
  DEF logo: `https://sleepercdn.com/images/team_logos/nfl/{team}.png`. Always provide an initials fallback on image error.

### FantasyCalc — `https://api.fantasycalc.com/values/current` (public, CORS-open)
- `?isDynasty=false&numQbs={qbs}&numTeams={teams}&ppr={ppr}` → rows with
  `player.sleeperId`, `value`, `overallRank`. Map `sleeperId → value`.
- `ppr` = `scoring_settings.rec` (default 1). `qbs` = count of `QB`+`SUPER_FLEX` starting slots (min 1). `teams` = `num_teams`.
- Used by the Trade Machine for fairness pricing. Degrade gracefully if it fails.

### News — server-side aggregator → static `news.json` (`scripts/news/`)
- **How it runs:** the deploy workflow (`.github/workflows/deploy.yml`) runs
  `node scripts/news/aggregate.ts --out public/news.json` (Node 24 runs TypeScript directly) before
  `vite build`, on every push **and every 2 hours** (cron `17 */2 * * *`). The app fetches
  `${BASE_URL}news.json` (same origin). The browser never contacts publishers. `public/news.json` is gitignored.
  GitHub pauses scheduled workflows after 60 days of repo inactivity.
- **Optional Worker:** if `VITE_NEWS_API` is set, the app reads `{VITE_NEWS_API}/api/news` instead (same response
  shape; `worker.js` is still not in the repo).
- **Pipeline:** fetch each enabled source once (20s timeout, identifying User-Agent) → parse RSS/Atom
  (`feed.ts`, no XML dependency) → sanitize (strip markup/scripts, decode entities, http(s)-only URLs, links must
  be on the publisher's own domain) → excerpt ≤ 240 chars (never `content:encoded` bodies) → categorize
  (`src/lib/newsTaxonomy.ts`, multi-label keyword rules) → match players (`players.ts`: full names only,
  fantasy positions, active; shared names need the team named in the text) → merge with the previously
  published file (rolling 14-day / 400-item history; ids = hash of canonical URL; same-title-same-publisher dedupe)
  → write. A failing feed is recorded in `sources[]` (with last success) and never fails the deploy.
- **Response:** `{ version, updated, sources[{id,name,homepage,kind,ok,count,error,fetchedAt,lastSuccess,note}],
  unavailable[{name,reason}], categories[], publishers[], articles[], playersMatched }`;
  article `{ id, title, url, publisher, publisherId, kind: news|article, author, ts, published, excerpt, image,
  categories[], players[{id,name}], tags[] }`.
- **Integrated (verified 2026-11-11, `scripts/news/sources.ts`):** FantasyPros (`/feed/`), 4for4
  (`/articles/rss.xml`), RotoWire NFL news + articles (licensed "for blogs and personal websites"), NBC Sports
  Rotoworld (`/fantasy/football.atom`), RotoBaller (`/category/nfl/feed`; a partner program also exists),
  Dynasty Nerds (`/feed/`). None disallowed by robots.txt.
- **Unavailable (never faked):** Draft Sharks and Footballguys publish no RSS/Atom feed or public API; scraping
  is not allowed. Listed in the app with the reason.
- **Content policy:** metadata + short excerpt + publisher-supplied thumbnail + link only. No full articles, no
  paywalled content, no scraping. Every card links to the publisher. Personal, non-commercial use.

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
    projection/       # projection engine (shared with scripts/model): math (ridge), engine (features, fit,
                      #   rolling backtest, validation gate, intervals), client (model.json + per-player breakdown)
    analytics/        # explainable models: history, volatility, usage, matchup, schedule,
                      #   lineupPlan (exact optimizer), lineupAnalysis (wires it to the model)
  hooks/              # useState wrappers over React Query: useLeague, useRosters,
                      # useMatchups, useProjections, useSeasonStats, useFantasyCalc, useNews
  store/              # Zustand: username, leagueId, theme, collapsed sections, bookmarks/read
  components/
    layout/           # AppShell, Sidebar (nav tree + connection box + theme switch), TopNav (search, week,
                      #   refresh, notifications, account), SearchPalette (Ctrl/Cmd+K), Menus, BottomNav, nav.ts
    dashboard/        # DashboardCard, WeeklyGamePlan, Matchup (hero), SeasonStrip, LeagueRace (standings +
                      #   playoff race), Insights (Optimal Lineup, Waiver Targets, Fantasy News), QuickAccess
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
- [x] News & Analysis hub: Worker-backed, filters (category/publisher/search/my-roster/saved), bookmarks, mark-read, states.
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
- 2026-11-11: **Intelligence platform, Phase 3: Trade War Room** (`/trades`; branch `trade-war-room`). Verified live today: FantasyCalc prices **draft picks only on its dynasty scale** (2027-2029, rounds 1-4, generic "YYYY Nth" rows used; Early/Mid/Late variants ignored, they need a draft slot we don't have); its redraft feed has no picks. So players and picks always share one scale: dynasty values when Sleeper reports `settings.type === 2`, redraft otherwise (picks then not offered). `settings.type` (0 redraft / 1 keeper / 2 dynasty) and `/league/{id}/traded_picks` (owner_id/roster_id are roster ids) follow Sleeper's docs and are **unverified on a real league**. Method: two lenses never blended: market fairness (FantasyCalc, summed per side; 1 - |diff| / larger side) and each team's best-lineup change over the next 3 weeks of projections (shared `createValuer`, refactored out of the waiver module). Verdicts: win-win / helps you / helps them / neutral; "acceptable" is an explicitly labeled estimate (fair >= 85% and their lineup not worse). Finder: 1-for-1 swaps, fair >= 85%, you gain >= 0.5/wk; split into win-win and "may need a sweetener" (their lineup flat to -1/wk); one deal per player received; keepers never offered. Analyzer: any players/picks with any team; rejects assets the teams don't own. Confidence rubric for trades (projection weeks, values known, cautions). Offer text is written for the recipient (the prototype's read backwards). Also: the app now **re-downloads the cached player book once per session when a roster references an unknown player** (found via a stale-cache artifact in the browser check). Verified: tsc, eslint, vitest (279; trade mutations all caught after adding two tests for gaps the first run exposed; the player-book guard mutation was only caught after strengthening its test), build, browser screenshots. Tooling note: the screenshot script had leaked 389 headless Edge processes; fixed (kills by profile path). **Open:** nothing run against a real league; FantasyCalc sums ignore the consolidation premium (flagged on uneven deals); keeper costs come in Phase 6. **Next:** Opponent Scouting.
- 2026-11-11: **News & Articles hub** (branch `news-hub`; user asked overnight to decide and keep going). Built the server-side aggregator above (no Worker needed, no credentials, no new dependencies) and rebuilt `/news` as **News & Articles**: featured analysis (fantasy-categorized first, then image, then priority publishers 4for4/FantasyPros, one per publisher), breaking player news (last 24h), trending players (2+ publishers in 3 days), personalized rails (my roster, this week's opponent, waiver watch = free agents in my league, keeper & dynasty incl. rookies), category rails (waivers, start/sit, trades, injuries), and an all-articles grid with search (title, player), NFL team, position, publisher, category, date range, newest/oldest, all/unread/saved, bookmarks and read/unread toggles; publisher health panel. Player pages show **Latest expert analysis** matched by player id; the dashboard card shows news about my roster. Mentions are labeled coverage, not recommendations. AI summaries skipped: no AI integration exists. Live dry run: 7/7 feeds, 100 articles, 88 KB, 3.4s. Verified: tsc (now also checks `scripts/`), eslint, vitest (353), build, real-data browser screenshots (desktop dark, phone light). Fixed during checks: ROS category rule was case-sensitive; player chips' accessible names; featured picked an uncategorized survivor-pool piece (now relevance-weighted); empty-looking thumbnail tiles; nested breaking cards; wrapping read buttons.
- 2026-11-11: **Intelligence platform, Phase 4: Opponent Scouting** (`/scouting`, branch `scouting`). Defaults to this week's opponent; any team selectable. Every section is labeled **Sleeper fact** (results from past-week matchups, the lineup they have set, injury designations) or **Model** (best projected lineup by the exact optimizer, position-group strength ranked across the league, head-to-head by group with the standard logistic win odds). Their set lineup is reported as facts (empty slots, Out/Questionable starters); differences from the projected best are a "model note"; nothing predicts manager behavior. Results chart uses Recharts (lazy chunk) with a table alternative. Projected lineups exclude Out/IR players. Optimizer tie-break added: between equal-value lineups, fill specific slots before flex (`SPECIFICITY` < `STABILITY`, never changes lineup value). Test setup: Testing Library async timeout raised to 5s (lazy pages under parallel load). Verified: tsc, eslint, vitest 369 (stable across repeated full runs), build, browser screenshot. **Next:** Playoff Simulator.
- 2026-11-11: **Intelligence platform, Phase 5: Playoff Simulator** (`/playoffs`, branch `playoffs`). Seeded Monte Carlo (Mulberry32 + Box-Muller; same inputs + seed = same odds) over the matchups Sleeper has posted for the rest of the regular season (`playoff_week_start - 1`). Weekly scores ~ normal(mean, sd): mean from season PPG, this week's best projected lineup, or a 50/50 blend (user choice); sd = team's own with 3+ games else league pooled, floor 10. Standings: current Sleeper records/PF, then wins (ties half), then points for (Sleeper default; custom tiebreakers not modeled), then a random draw. Playoffs: top N, fixed bracket, byes for top seeds when N is not a power of two (bye UI hidden otherwise). Outputs: playoff / bye / #1 seed / title odds, average wins and seed, full seed distribution, remaining SOS (opponents' expected points vs league average). Scenarios (win/lose this week, win out) reuse the same random draws. Regression tests: reproducibility, exactly N playoff spots and one champion per run, forced results always honored, standings-only outcome when no games remain, byes, schedule pairing, SOS. Verified: tsc, eslint, vitest 393, build, browser screenshot (8 teams, 9 weeks left). **Next:** Keeper Intelligence.
- 2026-11-11: **Intelligence platform, Phase 6: Keeper Intelligence** (`/keepers`, branch `keepers`). Sleeper doesn't store keeper costs, so rules are user-configured and saved per league in the store (`keeperRules`): keepers allowed (default `settings.max_keepers`), cost = round drafted or free, rounds earlier per year kept, round for undrafted players (default `settings.draft_rounds`), max years kept. Draft rounds come from `/draft/{league.draft_id}/picks`; years kept = consecutive drafts with `is_keeper`, following `previous_league_id` up to 3 seasons (all three fields per Sleeper docs, **unverified on a real league**; parsed defensively with notices when missing). Market round = rank among players (draft picks excluded) on FantasyCalc's dynasty board ÷ league size; saving = cost round − market round. Recommends up to the keeper limit among eligible players with a positive saving (with free keepers: the most valuable). Regression tests cover cost escalation, the round-1 cap, undrafted cost, the years limit, draft history parsing and recommendations. Verified: tsc, eslint, vitest 415, build, browser screenshot. **Next:** Game Day Mode.
- 2026-11-11: **Intelligence platform, Phase 7: Game Day Mode** (`/gameday`, branch `gameday`). Live scoreboard from Sleeper matchups (`points`, `players_points`, falling back to `starters_points`) for me and this week's opponent; per-starter game state from the schedule, treating points already scored as "live" when the schedule still says pre_game (it lags); projected final = live points + projected points left (full projection before kickoff, projection − points during the game, 0 when final/bye/Out); live win odds = logistic on the projected-final margin with spread 28 × √(share of projected points left) (equals the standard model at kickoff; 100/50/0 when all final). Alerts: empty slots, byes and Out starters (Sleeper facts) and swap suggestions only among players whose games haven't started (model). Polling: every 60s while a game is underway (something started and something unfinished), else every 5 min; never in background tabs; manual refresh; freshness badge. Verified: tsc, eslint, vitest 435, build, phone screenshot. **Next:** Fantasy GM.
- 2026-11-11: **Intelligence platform, Phase 8: Fantasy GM** (`/gm`, branch `gm`; first item in the More sheet / sidebar). A **rules-based** weekly brief, no AI (none is integrated): `buildBrief` in `src/lib/analytics/gm.ts` only re-ranks what the other tools already compute and adds no numbers of its own. Items: lineup changes from the optimizer (empty / Out / bye starters = "Do now"; projected upgrades largest first, ignoring gains < 0.5 pts, the Game Day floor), the best waiver upgrade, up to 2 articles about my roster from the last 72h, the best win-win trade, the playoff race only while open (5-95%), and the best keeper saving only in keeper/dynasty leagues (`settings.type` 1/2). Order: Do now, then This week (lineup, news, waivers), then Consider; max 8. Each item shows impact, confidence (when the tool has one), sources and a link to the tool. Summary strip: opponent, projected score, win odds, playoff odds (all model). The page runs the same inputs as each tool so numbers match: refactored `prepareSeason` + `DEFAULT_SEED`/`DEFAULT_SIMS` (playoffs) and `myKeepers` (keepers) out of their pages; `useKeeperInputs` takes `enabled` (redraft leagues skip those fetches). Loading tools are listed ("Still checking"), failed sources are named ("Not included this time"). Verified: tsc, eslint, vitest 446 (two targeted mutations caught: news window, Do-now rule), build, browser screenshots (desktop dark, phone light). Housekeeping: CLAUDE.md was found emptied on disk (likely OneDrive sync) and restored from git.
- 2026-11-12: **Premium dashboard redesign** (branch `redesign`), matched to the user's reference screenshot. *Shell:* 300px sidebar (256px on tablets; collapsible icon rail) with Dashboard, Fantasy GM, My Leagues (expands to the user's Sleeper leagues + Standings), Lineup Optimizer, Players, Waiver Wire, Trades, Keeper Tools, Analytics (Opponent Scouting, Playoff Simulator), News & Articles, Game Day Mode (a **Live** badge only while this week's schedule has a started-and-unfinished game, `weekIsLive`); Sleeper connection box (league, last sync = rosters fetch time, settings) and a Light/Dark switch. Top bar: global search (Ctrl/Cmd+K or "/"; pages, players in the player book at fantasy positions, league teams, news headlines; arrow keys + Enter), **week selector** (weeks 1..current; `viewWeek` in the store, not persisted, reset on league switch or sign-out; every page follows it and a banner offers "Back to Week N"), refresh, notifications (Sleeper facts about my set lineup: empty slots, Out and Questionable starters; plus roster news from the last 24h), account menu (settings, switch account with confirmation). Phones: header with menu button, 4 tabs + More, both opening the full nav drawer. *Dashboard:* welcome header (Sleeper display name, league, week, league picker when several); row 1 = Weekly Game Plan (top 3 Fantasy GM actions; the button says "Fantasy GM", **not "AI"**: it is rules-based) + Projected Score (best lineup, vs the league average of every team's best lineup) + Win Probability + Playoff Odds; row 2 = This Week's Matchup (records, rank, projections, live points once scoring starts, win chance), League Standings (top 4, always including mine), Playoff Race (SVG donut; bye row only if the bracket has byes, `byeCount`; division row says "Not modeled" when `settings.divisions` > 0; unavailable states when the season is over or the schedule is missing); row 3 = Optimal Lineup (Optimized / My Lineup toggle, Start/Bench), Top Waiver Targets (league free agents only, gain per week, suggested drop), Latest Fantasy News (newest 3, publisher badge, thumbnail when supplied, links out; lists unavailable sources). The previous dashboard cards remain under **More tools**. Deliberately not copied from the mockup because the data doesn't exist: "vs last week" playoff change, rostered %, division odds. The GM's inputs now come from a shared `useGmBrief` hook (GM page + dashboard). No new dependencies. Verified: tsc, eslint, vitest 496 (new `dashboard.test.tsx`, `shell.test.tsx`; mutation checks caught), build, browser screenshots at 1672x941 (dark + light), 1024 and 400 px, no horizontal overflow on any page. Test-timing fixes: several page tests now wait for independently loaded inputs (schedule, trending, bids) instead of reading synchronously after the first heading.
- 2026-11-12: **Dashboard layout and information-architecture pass** (branch `dashboard-layout`). Measured causes: a 5,755 px page at 1440 (a 3,000 px masonry of the original cards duplicating the new ones), five items squeezed into row 1 (stat cards 203 px wide, stretched to 332 px tall), short lists stretched to the lineup table's height, content capped at 1440 px, and projected score / win probability / playoff odds each shown twice. New order: (1) hero = Weekly Game Plan + This Week's Matchup (big scores, win-probability bar, projected edge by position from the same slot battles as the headline); (2) **Season at a glance** strip with four facts shown nowhere else (season points + rank, projection vs league average, roster health, waiver budget or priority); (3) **League Race** = standings (top 6 incl. mine, playoff cut line) + playoff race (donut, bye/title, projected seed and wins) in one panel; (4) Optimal Lineup + Top Waiver Targets side by side with Latest News as a full-width row of cards, switching to three equal columns at `3xl` (1600 px, new breakpoint in `index.css`; news changes layout by container query); (5) **Quick access**: the nine original cards as tiles with live one-line summaries, each opening the unchanged tool in a wide side panel (`Panel` overlay; cards render without their own header via the `CardBare` context). Every number appears once. Gradient only on the Game Plan. Main content now up to 1760 px with 16-48 px gutters; `scroll-padding-top` keeps focus clear of the sticky top bar. Overlays now stack: only the topmost handles Escape and the focus trap. Verified: tsc, eslint, vitest 496 (twice; mutation checks on overlay stacking and position edges caught), build, full-page screenshots at 1440 (3,032 px) and 1920 (2,567 px), side-by-side comparison with the reference, 0 px horizontal overflow from 390 to 1920 px.
- 2026-11-12: **Intelligence engine, Phase 1: projection engine + accuracy tracker** (branch `projection-engine`). Audit first: probed live Sleeper/FantasyCalc/Open-Meteo (facts recorded in §5); found and fixed a production bug (season stats are an array, so season PPG and Player Value's PPG half were always empty). New `scripts/model/build.ts` runs in the deploy workflow (after news, `continue-on-error`, ~8s, ~60 Sleeper requests) and publishes `public/model.json` (gitignored; previous file's metrics are kept as version history via `MODEL_PREVIOUS_URL`). Method (`src/lib/projection/engine.ts`): baseline = Sleeper projection; per position, ridge regression (prior = 30 pseudo-observations) of the baseline's error on recency-weighted last-3 points (3:2:1), last-3 expected points from usage (targets, carries, red-zone chances; xFP weights fitted per position on earlier games only) and previous-season PPG (4+ games), recent signals scaled by games/3. Rolling-origin backtest from week 4 of the previous season, no look-ahead (tested); a position's correction is enabled only if it beats the baseline by 2 standard errors; floor/median/ceiling = 10th/50th/90th percentile of earlier out-of-sample errors by position and projection tier. Fitted separately for PPR/half/std; leagues use the nearest format on their own scoring. **First live build (2025 + 2026 wk 1-9, 8,364 backtest player-games):** MAE 4.50 vs Sleeper 4.55; corrections on for QB (6.10 vs 6.35, mostly a bias fix: Sleeper QB +1.8 too high counting DNPs), RB (4.71 vs 4.78) and WR (4.50 vs 4.57); off for TE/K/DEF (no improvement). Recent fantasy points add ~nothing beyond Sleeper (coefficient ~0), usage and last season add a little. 80% ranges cover 79%. UI: Projection breakdown on player pages (value, baseline, floor/ceiling, per-signal contributions, last-3 usage table, efficiency-vs-usage note) and **/accuracy** (overall, by position with gate reasons, week by week, by injury designation, by projection size, versions, method). Not yet: engine values feeding the lineup optimizer (still Sleeper), accuracy by weather. Verified: tsc, eslint, vitest 522 (engine math, no-look-ahead, gate, intervals, build script, integration; mutations on gate bypass and the season-stats fix caught), build, screenshots of player page and /accuracy with the real model file.
- 2026-11-12: **Phase 2a: game weather** (branch `weather`). `WeatherIndicator` (Lucide icons: sunny, partly cloudy, cloudy, rain, snow, wind, thunderstorms, indoor; plus "forecast not out yet" and "unavailable") beside each player's game on the dashboard Optimal Lineup, the Lineup Optimizer table, Game Day starters (not yet started), My Roster and player pages. Tooltip (hover, keyboard focus, tap; Escape/outside tap closes; portal so tables never clip it): matchup, stadium and city, date with "kickoff time not published by Sleeper", roof status, conditions, temperature range, wind, gusts, precipitation chance and totals, risk flags, forecast age, home-stadium assumption, Open-Meteo attribution. One forecast request per stadium, shared; never for fixed roofs or games already played; refresh every 6 h a week out, hourly within 3 days, every 20 min on game day. Risk flags (sustained wind 20+ mph or gusts 30+, 0.25+ in precipitation, 0.5+ in snow, storms) are **context only, not applied to projections** (no validated adjustment; ordinary cold and light rain are never flagged). `PlayerRow` gained an `after` slot so controls never nest inside row buttons. Found by tests: storm mapping matched codes above 99; tapping the icon opened then immediately closed it (focus + click toggle). Verified: tsc, eslint, vitest 537, build; live Open-Meteo forecasts in a real browser.
- 2026-11-12: **Phase 2b + 3a: injury intelligence, Injury Domino Effect, Breakout Radar** (branch `opportunity`). `src/lib/analytics/opportunity.ts`: weekly usage book (snap share, targets, carries, touches, red-zone chances, points, expected points from the model's usage weights); availability from Sleeper designations (Out/IR/PUP/Sus/NA = out, Doubtful, Questionable = game-time decision, **never assumed inactive**); team context from the player book (depth-chart QB1 and its status, offensive-line injuries: positions T/G/C/OT/OG/OL); **domino**: each teammate at related positions, per-game usage in team games the injured player missed vs played (no workload assumed to move; no number without games on both sides, then depth chart only; samples under 3 games labeled small); **breakouts**: last 2 games vs earlier games, 2+ signals among snap share +10 pts, targets +2, touches +3, red-zone chances +1 per game, usage worth 3+ more than points scored (needs 4+ games). Pages: **/breakouts** (free agents in my league by default, all players, position filter) and **/injuries** (my roster designations with QB/OL context; domino for rostered out/doubtful players, biggest scorers first). Player pages gained an Availability section. Practice participation is not shown (Sleeper leaves it empty). Verified: tsc, eslint, vitest 547, build, browser screenshots.
- 2026-11-12: **Phase 4a: Start/Sit Simulator** (`/startsit`, branch `startsit`). Compare 2-4 players (defaults to my closest call: weakest RB/WR/TE starter vs best RB/WR/TE on the bench; add any free agent). Each player is simulated 10,000 times (seeded, reproducible) from his engine projection plus the published distribution of past projection errors for his position and projection size: `model.json` now carries 19-point error grids (5th..95th percentile, out-of-sample) per tier (`grid` / `baselineGrid`; older files fall back to a grid built from p10/p50/p90 with tails held). Shows chance to score the most, projection, floor/median/ceiling, matchup (defense rank vs position, context only), injury, weather, last-3 average, week-to-week consistency. Recommendation rule from my matchup win probability: 60%+ favors the floor, 40% or less the ceiling, otherwise the median. Stated simplifications: independent draws, tails held at 5th/95th. Test infra: suite-wide `testTimeout` 30s and per-test 15-20s limits raised to 60s (full parallel runs on this machine were timing out page tests intermittently; no test logic changed). Verified: tsc, eslint, vitest 557 (mutation on the floor/ceiling rule caught), build; live model rebuilt with full grids.
- 2026-11-12: **Realistic weather icons** (user request). The weather chip now shows full-color condition art (sun, partly cloudy, overcast, rain, snow, wind, thunderstorms) with the forecast high and, at 15+ mph, the wind; indoor games show "Dome", too-early "Later", missing forecasts a line icon (the set's N/A art was illegible on navy). The tooltip opens with a large icon, high/low and condition. Test infra: Vitest capped at 4 workers and async UI waits at 10s, because full parallel runs on this OneDrive-synced machine starved page tests (all failures passed alone); two consecutive full runs green.
- 2026-11-12: **Phase 3b: Player Stock Market** (`/market`, branch `market`). FantasyCalc rows now keep `trend30Day` and `positionRank` (`FcValue.trend30` / `positionRank`). Table (top 250 by value + all rostered QB/RB/WR/TE): value, 30-day change (points and %), this week's engine projection, next 3 weeks of Sleeper projections, opportunity (touches + targets per game, last 2 vs earlier), tracked change across this browser's own daily snapshots (IndexedDB `gb-market-<league>`, one per day, 60 days), owner, injury. Signals (`src/lib/analytics/market.ts`): buy low = value down 10%+ in 30 days with opportunity steady or up and not ruled out; sell high = value up 10%+ with scoring 3+ pts/game above usage-expected points, or opportunity down 3+. Filters: all, my team, free agents, buy low, sell high. Verified: tsc, eslint, vitest 564, build.
