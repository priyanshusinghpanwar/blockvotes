# Free Deployment Guide

This project is currently wired for:

- frontend on Vercel
- backend exposed from your local machine through ngrok

Current backend tunnel:

`https://screen-uniformly-scoured.ngrok-free.dev`

## 1. Start The Backend Locally

From the repository root:

```powershell
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

The API listens on local port `3000`.

## 2. Start ngrok

In a second terminal:

```powershell
ngrok http 3000
```

Keep that terminal open. The current tunnel forwards:

`https://screen-uniformly-scoured.ngrok-free.dev -> http://localhost:3000`

## 3. Backend Environment

Before starting the API, make sure `artifacts/api-server/.env` uses your Vercel frontend URL and allows the Capacitor mobile origins:

```env
APP_URL=https://blockvotes.vercel.app
CORS_ORIGIN=https://blockvotes.vercel.app,https://blockvotes-blockvotes.vercel.app,http://localhost,capacitor://localhost
PUBLIC_WEB_URL=https://blockvotes.vercel.app
SESSION_COOKIE_SAME_SITE=none
SESSION_COOKIE_SECURE=true
```

That lets:

- Vercel call the ngrok backend from the browser
- Android Capacitor use `http://localhost`
- iPhone Capacitor use `capacitor://localhost`

## 4. Deploy Frontend On Vercel

1. Push this repository to GitHub.
2. Import the same repository into Vercel.
3. Set the Vercel project name to `blockvotes` if the slug is available.
4. Keep the project root as the repository root. The root `vercel.json` already sets:
   - install command: `corepack enable && pnpm install --frozen-lockfile`
   - build command: `pnpm --filter @workspace/blockvotes run build`
   - output directory: `artifacts/blockvotes/dist/public`
5. Add this Vercel environment variable:

```env
VITE_API_BASE_URL=https://screen-uniformly-scoured.ngrok-free.dev
```

6. Deploy.

## 5. Quick Checks

- API health: `https://screen-uniformly-scoured.ngrok-free.dev/api/healthz`
- Frontend: `https://blockvotes.vercel.app`
- Admin login page: `https://blockvotes.vercel.app/company/login`

## 6. When ngrok Gives You A New URL

If ngrok assigns a new public URL later:

1. Update `VITE_API_BASE_URL` in Vercel
2. Rebuild the mobile app with the new `VITE_API_BASE_URL`
3. Restart the backend if you changed any API env vars

ngrok is great for testing, but the public URL can change on the free plan, so treat this as a lightweight demo deployment rather than a permanent production backend.
