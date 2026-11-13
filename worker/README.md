# GameplanBlitz AI Worker

A Cloudflare Worker that powers the optional AI parts of GameplanBlitz:

| Route | What it does |
| --- | --- |
| `POST /api/gm` | AI Fantasy GM answer (Claude), streamed as server-sent events |
| `POST /api/studio/script` | Podcast script (Claude, JSON) from an outline the user approved |
| `POST /api/studio/tts` | One line of speech, `audio/mpeg` (Deepgram Aura on Workers AI) |
| `GET /api/usage` | Today's usage and limits for the caller |
| `POST /api/podcast/subscribe`, `/unsubscribe`, `/delete`; `GET /api/podcast/episodes` | Scheduled Fantasy War Room episodes (opt-in, private) |
| Cron Trigger (hourly) | Prepares due episodes for subscribers, with no browser involved |

Without this Worker the app still works: it falls back to built-in answers, the built-in script writer and the browser's own voices.

## What it keeps safe

- **API keys stay server-side.** The Anthropic key is a Worker secret, and Workers AI uses its own binding. The site only ever knows the Worker's URL.
- **Only the fact sheet is sent.** The app sends the facts its own tools computed, plus the question or approved outline. The prompts tell Claude to use only those facts and to cite them. The app then checks every citation and number again and flags anything unsupported.
- **Nothing is stored.** The Worker keeps no league data, questions, scripts or audio. KV holds only usage counters, keyed by caller IP and date, and they expire after 2 days.
- **Access is restricted.**
  - Calls must come from an origin in `ALLOWED_ORIGINS`.
  - An optional `ACCESS_TOKEN` secret requires a matching `x-gb-token` header. Users paste the token in the app's Settings, and it is kept in their browser only.
- **Input is validated before any money is spent.** Request size, question length, fact count and voice IDs are all checked.
- **Cost controls:**
  - A per-minute rate limit per IP.
  - Daily quotas per IP.
  - A global daily cap across all callers.
  - Bounded `max_tokens`.
  - Effort `low` for answers and `medium` for scripts.
  - Speech text capped at 800 characters per line.
  - The app also enforces its own daily allowance per device.
- **Cancellation.**
  - When the browser stops a streamed answer, the Worker's next write fails and it aborts the upstream request.
  - The app retries network errors, 5xx responses and short rate limits. It never retries quota or validation errors.
- **Refusals.** Requests opt into Anthropic's server-side refusal fallback (`fallbacks: "default"`). If the whole chain still declines, the app shows a refusal message rather than an answer.

## Voices and hosts

- **Voices:** Deepgram Aura voices on Cloudflare Workers AI (`@cf/deepgram/aura-1`), which are licensed synthetic voices. Only the voice IDs listed in `src/logic.ts` are accepted.
- **Hosts:** "Jordan" and "Casey" are fictional characters, not modeled on any real broadcaster.
- **Disclosure:** the app adds a spoken AI disclosure at the start and end of every episode.

## Scheduled podcasts (The Fantasy War Room)

- **What runs:** every hour (`crons` in `wrangler.toml`) `src/podcastJob.ts` reads the opted-in subscriptions, works out which show is due from the NFL schedule's dates in each subscriber's time zone (Postgame Report three days before the week's first game but never before the previous week's last game, Waiver War Room two days before, Game Plan Preview on the first game day, Kickoff Briefing the morning of the first weekend games; each from the subscriber's chosen hour, 4 AM-12 PM, default 6 AM). The Waiver War Room uses free agents who would improve this week's best lineup (Sleeper projections) and what each of your players is worth to it, since the browser's waiver and trade tools don't run on the server, fetches the league from Sleeper's public API, builds the fact sheet with the app's own code and writes the episode with the built-in, evidence-citing writer. No AI model is called, so episodes cost nothing; the app plays them with device voices.
- **Reliability:** one job record per league, user, season, week and show (done jobs never rerun); a job marked running is skipped for 15 minutes; failures are recorded and retried on later runs, up to 3 attempts; nothing runs outside the regular season; a daily episode counter is kept for cost tracking.
- **Privacy:** these routes require `ACCESS_TOKEN` (without it they answer 403), and the Sleeper user must be a member of the league. Stored: the subscription (Sleeper username and id, league id, show settings, time-zone offset) and the episodes, which expire after 120 days. Opting out deletes the subscription and every stored episode.
- **Plan:** parsing Sleeper's 5 MB player file takes more CPU time than the Workers Free plan allows per invocation; use the Workers Paid plan for the scheduled job.
- **Verified so far:** the job is unit-tested in-process with an in-memory KV (generation, no duplicates, time-zone due hours, retries and giving up, the running-job guard, out-of-season, opt-out), and bundled without Vite and run in plain Node. It has **not yet run on Cloudflare**: deploy it and check the Cron Trigger's logs (`npx wrangler tail`) to confirm the first scheduled run.

## Deploy

1. Install the dependencies:

   ```sh
   cd worker
   npm install
   ```

2. Sign in to Cloudflare: `npx wrangler login`
3. Create the usage store and the episode store:

   ```sh
   npx wrangler kv namespace create USAGE
   npx wrangler kv namespace create EPISODES
   ```

   Paste each `id` it prints into `wrangler.toml`.
4. Add the Anthropic key: `npx wrangler secret put ANTHROPIC_API_KEY`
5. Optional but recommended: `npx wrangler secret put ACCESS_TOKEN`. Use any long random string.
6. Check `ALLOWED_ORIGINS` in `wrangler.toml`. It should list your GitHub Pages origin, with no path.
7. Deploy: `npx wrangler deploy`. Note the URL, e.g. `https://gameplanblitz-ai.<you>.workers.dev`.
8. In the GitHub repository, go to Settings → Secrets and variables → Actions → Variables. Add `VITE_AI_API` with the Worker URL, then re-run the deploy workflow.
9. In the app, open Settings → AI Fantasy GM & Podcast Studio. Paste the access token if you set one, and allow sending league facts.

## Costs (check current pricing)

- **Claude:** the model is `claude-opus-5-5` by default; override it with `AI_MODEL`. It costs $4 per million input tokens and $20 per million output tokens. A typical answer sends a few thousand tokens of facts, which are cached across follow-ups.
- **Speech:** Deepgram Aura on Workers AI costs about $0.015 per 1,000 characters. A standard episode is roughly 4,000–9,000 characters.
- **Limits:** the defaults are in `src/logic.ts` (`DEFAULT_LIMITS`), and you can override each one with a `LIMIT_*` var.

## Develop

- Typecheck against the SDK: `npm run typecheck`. Running `tsc --noEmit` from the repo root is the same check.
- Test: the pure logic in `src/logic.ts` (validation, prompts, quotas, CORS, SSE framing) is tested by the app's test run (`worker/src/logic.test.ts`).
