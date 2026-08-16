# Local development

## Toolchain

- Node.js 24.18.0
- npm 11.16.0
- npm is the only supported package manager for this repository.

Use `npm ci` for reproducible installs. Do not regenerate the lockfile with Bun,
pnpm, or Yarn.

## Environment

Copy `.env.example` to `.env` and replace placeholders locally. Never commit
`.env` or real credentials.

Browser-visible variables:

- `VITE_API_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Server-only variables:

- `GROQ_API_KEY`
- `GROQ_API_KEY_2`
- `GROQ_MODEL`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_JWT_AUDIENCE`
- `FRONTEND_ORIGIN`
- `PORT`

The browser Supabase client is disabled when either browser variable is absent.
The backend Supabase factories and JWKS verifier are lazy and make no network
connection until an authenticated request requires them. The backend accepts
identity only from a verified access-token `sub`; email and request-body IDs are
never ownership credentials.

## Local Supabase

The pinned Supabase CLI is a project dev dependency. Invoke it through npm/npx.

```bash
npx supabase start
npx supabase db reset --local
npm run test:rls
```

`supabase db reset` applies migrations only to the local Supabase containers.
Do not run `supabase link`, `supabase db push`, or any remote migration command
without a separately reviewed production change window.

Google OAuth remains disabled in the local configuration for this Foundation
change. The browser code is ready to call Supabase OAuth after the provider and
redirect URLs receive a separate production configuration review.

## Application checks

```bash
npm run typecheck
npm run build
npm test
```

The liveness endpoints are `GET /health` and `GET /api/health`. They do not
contact Supabase or expose configuration values.
