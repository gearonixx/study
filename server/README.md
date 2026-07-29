# study — cloud sync backend

A small, standalone Vercel project that adds **"Sign in with GitHub" + server-side
storage** to the study tracker. The frontend stays on GitHub Pages and calls this
API cross-origin. Until you finish the steps below and set `VITE_API_BASE`, the app
runs exactly as before — local-first, no server.

## How it works

- **Auth** — GitHub OAuth. `/api/auth/login` → GitHub → `/api/auth/callback` exchanges
  the code (server-side, with the client secret), mints a short-lived `wz_code`, and
  redirects back to the SPA. The SPA `POST`s it to `/api/auth/session` and gets a
  90-day **session JWT** in the response body (never in a URL).
- **Data** — `GET/PUT /api/data`, authorized by `Authorization: Bearer <session JWT>`,
  keyed by GitHub user id. The whole database is one `jsonb` blob in Neon Postgres —
  the same unified shape the app exports and stores locally.
- **Cross-origin** — bearer tokens (not cookies), so Pages ↔ Vercel needs no
  third-party cookies. CORS is locked to `ALLOWED_ORIGIN`.

## One-time setup (~10 minutes)

### 1. Register a GitHub OAuth App
<https://github.com/settings/developers> → **New OAuth App**
- **Application name:** study
- **Homepage URL:** `https://gearonixx.github.io/study/`
- **Authorization callback URL:** `https://<your-api>.vercel.app/api/auth/callback`
  (you'll get the exact host in step 2 — come back and fill it in)
- Save. Copy the **Client ID**, generate a **Client secret**.

### 2. Create the Vercel project
From this `server/` directory:
```bash
npm i -g vercel      # if needed
cd server
vercel               # link/create a new project — set the root to this folder
```
Note the production URL it prints, e.g. `https://study-api.vercel.app`. Put its
`/api/auth/callback` into the OAuth App from step 1.

### 3. Add a database (Neon Postgres)
Vercel dashboard → your project → **Storage** → **Create** → **Neon**. Vercel injects
`DATABASE_URL` automatically. (The `users` table is created on first request — no
manual migration.)

### 4. Set environment variables
Vercel → project → **Settings → Environment Variables** (Production), or `vercel env add`:

| Key | Value |
| --- | --- |
| `GITHUB_CLIENT_ID` | from step 1 |
| `GITHUB_CLIENT_SECRET` | from step 1 |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `ALLOWED_ORIGIN` | `https://gearonixx.github.io` |
| `DATABASE_URL` | added by Neon in step 3 |

Redeploy: `vercel --prod`.

### 5. Turn it on in the frontend
In the **GitHub repo** (`gearonixx/study`) → **Settings → Secrets and variables →
Actions → New repository secret**:
- **Name:** `VITE_API_BASE`
- **Value:** your Vercel URL, e.g. `https://study-api.vercel.app`

Then re-run the **Deploy to GitHub Pages** workflow (Actions tab → Run workflow, or push
any commit). The build bakes in the API base and the **Cloud sync** card appears in
Settings.

### 6. Test
Open `https://gearonixx.github.io/study/#/settings` → **Sign in with GitHub** → approve.
You should return signed in, with your data pushed to the server. Sign in from another
device/browser and the same data loads.

## Local development
```bash
cp .env.example .env    # fill in the same values
vercel dev              # serves the API on http://localhost:3000
```
Point the frontend at it by building/serving with `VITE_API_BASE=http://localhost:3000`.

## Files
- `api/auth/login.ts` — redirect to GitHub
- `api/auth/callback.ts` — code→token exchange, upsert user, hand back `wz_code`
- `api/auth/session.ts` — `wz_code` → session JWT
- `api/data.ts` — GET/PUT the user's database blob
- `lib/` — env, CORS, JWT, and Postgres access
