# Free Deployment Guide

This project is set up to deploy the frontend on Vercel and the API plus Postgres database on Render.

## 1. Push The Repo

Push this repository to GitHub first. Both Vercel and Render can import it from GitHub.

## 2. Deploy API On Render

1. Open Render and create a new Blueprint from this repository.
2. Render will detect `render.yaml`.
3. Use the free plan for `blockvotes-api` and `blockvotes-db`.
4. When Render asks for unsynced environment variables, use:
   - `CORS_ORIGIN`: your Vercel URL, for example `https://your-site.vercel.app`
   - `PUBLIC_WEB_URL`: same Vercel URL
   - `APP_URL`: same Vercel URL
   - `BREVO_SMTP_LOGIN`, `BREVO_SMTP_PASS`, `BREVO_SENDER`: your Brevo SMTP values if you need email OTP delivery
5. After deploy, copy the Render API URL, for example `https://blockvotes-api.onrender.com`.

The first API request can be slow on Render free web services because they spin down after idle time.

## 3. Deploy Frontend On Vercel

1. Import the same GitHub repository into Vercel.
2. Set the Vercel project name to `blockvotes`. If that slug is available, your production URL will be `https://blockvotes.vercel.app`.
3. Keep the project root as the repository root. The root `vercel.json` already sets:
   - install command: `corepack enable && pnpm install --frozen-lockfile`
   - build command: `pnpm --filter @workspace/blockvotes run build`
   - output directory: `artifacts/blockvotes/dist/public`
4. Add this Vercel environment variable:
   - `VITE_API_BASE_URL`: your Render API URL, for example `https://blockvotes-api.onrender.com`
5. Deploy.

## 4. Update Render CORS

After Vercel gives you the final frontend URL, go back to Render and set these API environment variables to that exact URL:

- `CORS_ORIGIN`
- `PUBLIC_WEB_URL`
- `APP_URL`

Then redeploy the Render API.

## 5. Quick Checks

- API health: `https://blockvotes-api.onrender.com/api/healthz`
- Frontend: `https://your-site.vercel.app`

Render free Postgres databases are for demos and expire after 30 days, so do not use the free database for real election data.
