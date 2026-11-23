# UTEG

Judging software for Swiss Geräteturnen competitions: starters, divisions and lineups, grading on
tablets, live displays, rankings and PDFs. See [docs/PLAN.md](docs/PLAN.md) for the design.

## Setup

Needs Node 24 (`.nvmrc`), pnpm and Docker or Podman.

```sh
docker compose up -d       # PostgreSQL on port 5433
cp .env.example .env       # then set BETTER_AUTH_SECRET
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm seed                  # optional demo data
pnpm dev                   # http://localhost:5199
```

| Variable             | Meaning                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection                                                                                |
| `APP_URL`            | Address the app is opened with. Requests from any other origin are rejected, also from a LAN address |
| `BETTER_AUTH_SECRET` | At least 32 random characters, signs the session cookies                                             |
| `LOG_LEVEL`          | pino level, `info` by default                                                                        |

To judge from a tablet in the local network, set `APP_URL` to the address of the computer
(`http://192.168.1.20:5199`) and run `pnpm dev --host`.

## Checks

```sh
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test:ci       # needs the database, uses its own uteg_test
pnpm knip
pnpm e2e
```

## Production

`docker build -t uteg .` builds an image that applies migrations on start and listens on port 3000.
Every push to `main` publishes one to ghcr.io. Run exactly one instance: live updates and rate
limits are kept in memory.

Put a TLS proxy in front that **replaces** `X-Forwarded-For` with the client address. Rate limiting
of logins relies on it: with no such header, or one with several addresses, all visitors share one
limit. Don't buffer responses of `/api/**/events` and `/api/events/**` (server-sent events).
`GET /healthz` checks the database connection.
