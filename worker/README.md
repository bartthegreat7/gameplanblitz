# GameplanBlitz AI Worker

A Cloudflare Worker that powers the optional AI answers in the GameplanBlitz AI Fantasy GM:

| Route | What it does |
| --- | --- |
| `POST /api/gm` | AI Fantasy GM answer (Claude), streamed as server-sent events |
| `GET /api/usage` | Today's usage and limit for the caller |

Without this Worker the app still works: the AI Fantasy GM falls back to its built-in answers, which use no AI.

## What it keeps safe

- **The API key stays server-side.** The Anthropic key is a Worker secret. The site only ever knows the Worker's URL.
- **Only the fact sheet is sent.** The app sends the facts its own tools computed, plus the question and recent conversation. The prompt tells Claude to use only those facts and to cite them. The app then checks every citation and number again and flags anything unsupported.
- **Nothing is stored.** The Worker keeps no league data or questions. KV holds only usage counters, keyed by caller IP and date, and they expire after 2 days.
- **Access is restricted.**
  - Calls must come from an origin in `ALLOWED_ORIGINS`.
  - An optional `ACCESS_TOKEN` secret requires a matching `x-gb-token` header. Users paste the token in the app's Settings, and it is kept in their browser only.
- **Input is validated before any money is spent.** Request size, question length, history and fact count are all checked.
- **Cost controls:**
  - A per-minute rate limit per IP.
  - A daily quota per IP.
  - A global daily cap across all callers.
  - Bounded `max_tokens` and effort `low`.
  - The app also enforces its own daily allowance per device.
- **Cancellation.**
  - When the browser stops a streamed answer, the Worker's next write fails and it aborts the upstream request.
  - The app retries network errors, 5xx responses and short rate limits. It never retries quota or validation errors.
- **Refusals.** Requests opt into Anthropic's server-side refusal fallback (`fallbacks: "default"`). If the whole chain still declines, the app shows a refusal message rather than an answer.

## Deploy

1. Install the dependencies:

   ```sh
   cd worker
   npm install
   ```

2. Sign in to Cloudflare: `npx wrangler login`
3. Create the usage store:

   ```sh
   npx wrangler kv namespace create USAGE
   ```

   Paste the `id` it prints into `wrangler.toml`.
4. Add the Anthropic key: `npx wrangler secret put ANTHROPIC_API_KEY`
5. Optional but recommended: `npx wrangler secret put ACCESS_TOKEN`. Use any long random string.
6. Check `ALLOWED_ORIGINS` in `wrangler.toml`. It should list your GitHub Pages origin, with no path.
7. Deploy: `npx wrangler deploy`. Note the URL, e.g. `https://gameplanblitz-ai.<you>.workers.dev`.
8. In the GitHub repository, go to Settings → Secrets and variables → Actions → Variables. Add `VITE_AI_API` with the Worker URL, then re-run the deploy workflow.
9. In the app, open Settings → AI Fantasy GM. Paste the access token if you set one, and allow sending league facts.

## Costs (check current pricing)

- **Claude:** the model is `claude-opus-5-5` by default; override it with `AI_MODEL`. It costs $4 per million input tokens and $20 per million output tokens. A typical answer sends a few thousand tokens of facts, which are cached across follow-ups.
- **Limits:** the defaults are in `src/logic.ts` (`DEFAULT_LIMITS`), and you can override each one with a `LIMIT_*` var.

## Develop

- Typecheck against the SDK: `npm run typecheck`.
- Test: the pure logic in `src/logic.ts` (validation, prompts, quotas, CORS, SSE framing) is tested by the app's test run (`worker/src/logic.test.ts`).
