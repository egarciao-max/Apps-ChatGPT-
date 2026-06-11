# FitPal AI 💪

AI-powered personal fitness, calorie, and gym coach — built on Cloudflare infrastructure with Cloudflare Zero Trust security.

**Stack:** Cloudflare Pages + Pages Functions · Claude Haiku · Cloudflare D1 · Cloudflare KV · Zero Trust Access · PWA

---

## Features

| Feature | Details |
|---|---|
| 🤖 AI Coach | Claude Haiku — chat, meal/workout generation, daily tips |
| 🍎 Calorie Tracker | Log meals by type, AI calorie estimation, macro breakdown |
| 💪 Workout Tracker | Exercise logger, built-in library, workout timer, history |
| 📊 Dashboard | Progress rings, 7-day calorie chart, water tracker, streaks |
| 📈 Progress | Weight chart, calorie trend, BMI · TDEE · 1RM calculators |
| 🔊 TTS | Web Speech API reads AI responses aloud |
| 📱 PWA | Installable, offline-capable, iPhone safe-area support |
| 🔒 Zero Trust | Cloudflare Access protects the entire app |

---

## Deploy in 5 Steps

### 1. Create Cloudflare Resources

```bash
# Install Wrangler
npm install -g wrangler
wrangler login

# Create D1 database
wrangler d1 create fitpal-db
# → copy the database_id

# Apply schema
wrangler d1 execute fitpal-db --file=schema.sql --remote

# Create KV namespace
wrangler kv:namespace create FITPAL_KV
# → copy the id
```

### 2. Deploy to Cloudflare Pages

1. Push this repo to GitHub
2. Go to **Cloudflare Dashboard → Pages → Create Application → Connect to Git**
3. Select this repo
4. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/` (or `.`)

### 3. Bind D1 and KV in Pages Settings

In **Pages → Settings → Functions → Bindings**:

| Type | Variable name | Resource |
|------|--------------|----------|
| D1 Database | `DB` | `fitpal-db` |
| KV Namespace | `KV` | `FITPAL_KV` |

### 4. Add Environment Variables

In **Pages → Settings → Environment Variables**:

| Variable | Value |
|----------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `DEV_MODE` | `false` (set `true` to bypass Zero Trust during dev) |

### 5. Set Up Cloudflare Zero Trust

1. Go to **Cloudflare Zero Trust → Access → Applications → Add an application**
2. Choose **Self-hosted**
3. **Application domain:** `your-pages-domain.pages.dev`
4. Create a **Policy** → Allow → Emails → add your email: `enrique@oropezas.com`
5. Under **Settings → Cookie Settings**, set **SameSite: Lax**
6. Copy the **Application Audience (AUD) tag**
7. Add it as Pages env var: `CF_ACCESS_AUD` = `<aud tag>`

That's it — now only you can access the app.

---

## Configure the App

After deploying, open your Pages URL and go to:

**Progress tab → Settings section → API Worker URL**

Enter your Pages URL: `https://your-project.pages.dev`

This tells the frontend where to send API calls. The `/api/*` routes are served by the Pages Function at `functions/api/[[route]].js`.

---

## Local Development

```bash
# Install Wrangler
npm install -g wrangler

# Run locally with D1 + KV simulation
wrangler pages dev . --d1 DB=<database_id> --kv KV=<kv_id>

# Set env vars for local dev
export ANTHROPIC_API_KEY=sk-ant-...
export DEV_MODE=true
```

---

## Architecture

```
Browser (PWA)
    │
    ├── Static Assets ──► Cloudflare Pages CDN (global edge)
    │
    └── /api/* ──► Cloudflare Pages Function (Worker)
                        │
                        ├── Cloudflare Zero Trust JWT validation
                        ├── D1 Database (user data, meals, workouts)
                        ├── KV (caching)
                        └── Anthropic API (Claude Haiku)
```

## Security (Zero Trust)

- All traffic goes through **Cloudflare Access** before reaching your app
- The Pages Function validates the `CF-Access-Jwt-Assertion` JWT header on every API call
- No credentials stored in the browser — identity comes from CF Access
- `_headers` file adds security headers (CSP, X-Frame-Options, etc.)
- HTTPS enforced by Cloudflare

## Database Schema

See [`schema.sql`](./schema.sql) — tables for users, meals, workouts, workout_sets, weight_logs, water_logs, chat_history.
