# Database package

`@workspace/db` auto-discovers `DATABASE_URL` from common monorepo env files, including:

- `.env`
- `.env.local`
- `artifacts/api-server/.env`
- `artifacts/api-server/.env.local`

This makes `pnpm --filter @workspace/db run push` work from the workspace root without requiring a manual `DATABASE_URL` export first.
