# English Fluency Tracker

Created by **Kiyan Amirian** · © 2026 Kiyan Amirian · Released under the [MIT License](LICENSE).

A daily tracker for building natural, fluent English. It works with **any AI**: learners can connect their own API key, or use the copy-and-paste mode in any AI chat without a key.

## What it does

- **Daily check-ins and flexible schedules**: log real minutes for listening, shadowing, speaking, chat, reading, grammar, collocations, writing, and review.
- **Activity session log** for detailed listening, reading, shadowing, and speaking records, with an optional voice-clip recorder.
- **Learning library** for collocations, phrasal verbs, grammar, and vocabulary, with recoverable Trash, Anki and NotebookLM exports, and AI example checks.
- **Writing Lab**: draft, self-check, get AI review, then rewrite from memory.
- **Practice Zone**: guided conversation, small talk, friend chat, role-play, short writing, grammar, and collocation practice, with smart target selection and scored reviews that turn reusable mistakes into new cards.
- **Flashcards and application quiz** with spaced repetition. Only reviewed or AI-created examples become quiz sentences.
- **Spelling and dictation** practice that puts recent mistakes first.
- **Progress** calendars (day, week, month, year) and charts.
- **AI handoff**: a Markdown brief of the learner's profile and recent progress for any AI chat.
- **Learner profile**: name, level, English variety (American, British, Canadian, Australian, or International), first language, and goals. Every prompt uses it.
- **Google sign-in** (optional) for cloud sync across devices, with each account's data kept separate.
- **Backup** export and import as JSON.

## How the AI works

Every AI feature offers two paths:

| Path | What the learner does | What it needs |
|---|---|---|
| **Run with my AI** | Click once; the result is applied automatically. | Sign in and connect a provider in Settings. |
| **Copy prompt** | Paste the prompt into ChatGPT, Claude, Gemini, or another assistant, then paste its JSON reply back. | Nothing. No account or API key needed. |

Supported providers for connected AI:

- **OpenAI** (Responses API)
- **Anthropic / Claude** (Messages API)
- **Google Gemini** (Gemini API)
- **Any OpenAI-compatible service** (Chat Completions), with presets for OpenRouter, Groq, Mistral, xAI, DeepSeek, and Together AI, or any custom HTTPS base URL.

Learners choose a model from the list their own key can access (**Load my models**), or type a model ID. The server uses each provider's strictest structured-output mode and falls back to plain JSON when a model does not support it. Usage is billed by the learner's provider. The tracker shows token counts, not prices.

## Project layout

```
public/              Static site, served by Workers Static Assets
  index.html         Page structure and styles
  tracker.js         Main tracker logic, storage, sync, profile, backups
  account.js         Account card and AI-connection settings
  practice.js        Practice Zone
  spelling.js        Spelling & dictation
  shared/prompts.js  Prompts and JSON schemas shared by browser and server
  privacy.html       Privacy page (review before publishing)
  _headers           Security headers for static files
src/                 Cloudflare Worker
  worker.js          Routes /auth/* and /api/*
  auth.js            Google sign-in (OAuth 2.0 + PKCE) and sessions
  ai.js              Provider adapters, model listing, encrypted key storage
  sync.js            Per-account cloud sync with revision checks
  crypto.js, http.js Helpers
migrations/          D1 database schema
test/                Mock AI provider plus API and browser tests
```

## Run it locally

Requires Node.js 22 or newer (needed by Wrangler 4).

```bash
npm install
cp .dev.vars.example .dev.vars
openssl rand -base64 32
```

Paste the generated value after `KEY_ENCRYPTION_SECRET=` in `.dev.vars`, then:

```bash
npm run db:migrate:local
npm run dev
```

Open http://localhost:8787. With `DEV_LOGIN=true`, Settings shows **Test sign-in (local only)**, so you can try sync and AI connections without Google. That button only works on `localhost`.

## Deploy to Cloudflare

1. **Sign in to Cloudflare**
   ```bash
   npx wrangler login
   ```
2. **Create the database** and copy the `database_id` it prints into `wrangler.jsonc`:
   ```bash
   npx wrangler d1 create english-fluency-tracker
   ```
3. **Create the tables**
   ```bash
   npm run db:migrate:remote
   ```
4. **Add the secrets.** Each command prompts for its value.
   ```bash
   npx wrangler secret put KEY_ENCRYPTION_SECRET
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
   Use a fresh `openssl rand -base64 32` value for production. **Keep it safe:** if it changes, saved API keys can no longer be decrypted and learners must add them again.
5. **Deploy**
   ```bash
   npm run deploy
   ```
   Wrangler prints the site address, for example `https://english-fluency-tracker.<your-subdomain>.workers.dev`. You can add a custom domain in the Cloudflare dashboard later.

Optional: to limit who can sign in while you test, set `ALLOWED_EMAILS` in `wrangler.jsonc` (comma-separated emails or `@domain.com` entries) and deploy again.

## Set up Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/), create or choose a project.
2. Open **Google Auth Platform**. Under **Branding**, enter the app name, a support email, and your privacy page (`https://<your-site>/privacy`). Under **Audience**, choose **External**.
3. Under **Clients**, choose **Create client** → **Web application**. Add these **Authorized redirect URIs**:
   - `https://<your-site>/auth/google/callback`
   - `http://localhost:8787/auth/google/callback` (to sign in during local development)
4. Copy the client ID and client secret into the Wrangler secrets above. For local development, put them in `.dev.vars`.
5. While the app's publishing status is **Testing**, only test users you add under **Audience** (up to 100) can sign in. Publish the app when you are ready for anyone with a Google account. The tracker asks only for `openid`, `email`, and `profile`.

## Security notes

- API keys are encrypted with AES-GCM using `KEY_ENCRYPTION_SECRET`. Each key is bound to its owner and connection, is never sent back to the browser, and is redacted from provider error messages.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` over HTTPS. The database stores only a SHA-256 hash of each session token.
- Every request that changes data must come from the site's own origin.
- Signed-in progress is cached in the browser under a per-account key and removed on sign-out, so people who share a browser do not see each other's data.
- Custom AI base URLs must use HTTPS.
- **Settings → Delete account** removes the account, synced data, and saved keys.

## Tests

With `npm run dev` running and `.dev.vars` set up as in `.dev.vars.example`, plus these local-only overrides:

```
ALLOW_HTTP_AI_BASE=true
OPENAI_API_BASE=http://127.0.0.1:8790/openai/v1
ANTHROPIC_API_BASE=http://127.0.0.1:8790/anthropic/v1
GEMINI_API_BASE=http://127.0.0.1:8790/gemini/v1beta
GOOGLE_CLIENT_ID=test-client.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=test-secret
GOOGLE_AUTH_URL=http://127.0.0.1:8790/google/auth
GOOGLE_TOKEN_URL=http://127.0.0.1:8790/google/token
```

```bash
node test/mock-ai.mjs
node test/api.mjs
node test/e2e.mjs
```

`test/e2e.mjs` needs Playwright (`npm install --no-save playwright` and `npx playwright install chromium`). Never use these overrides in production.
