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
| `RESEND_API_KEY`     | Key to send mails with [Resend](https://resend.com). Required in production, else mails are logged   |
| `MAIL_FROM`          | Sender of mails, of a domain verified with Resend: `UTEG <noreply@example.com>`                      |
| `LOG_LEVEL`          | pino level, `info` by default                                                                        |

To judge from a tablet in the local network, set `APP_URL` to the address of the computer
(`http://192.168.1.20:5199`) and run `pnpm dev --host`.

## Admins

Admins see all competitions and have the rights of an owner in them. Make an account one in the
database:

```sql
UPDATE "user" SET "isAdmin" = true WHERE email = 'me@example.com';
```

## Checks

```sh
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test:ci       # needs the database, uses its own uteg_test
pnpm knip
pnpm e2e           # a whole competition in Chromium (pnpm exec playwright install chromium)
```

## Data of uteg-v2

```sh
pnpm migrate:v2 <dump.sql> [<storage directory of v2>]
```

Copies a `mariadb-dump` of uteg-v2 into a database without competitions, athletes and clubs, all or
nothing. Accounts get no password, also existing ones with an unverified address lose theirs:
everyone has to use "Passwort vergessen", which verifies the address. No mails are sent. Logos are
only copied with the storage directory. Dumps and the output contain personal data, keep them out of
the repository.

## Production

`docker build -t uteg .` builds an image that applies migrations on start and listens on port 3000.
Every push to `main` publishes one to ghcr.io. Run exactly one instance: live updates and rate
limits are kept in memory.

Put a TLS proxy in front that **replaces** `X-Forwarded-For` with the client address. Rate limiting
of logins relies on it: with no such header, or one with several addresses, all visitors share one
limit. Don't buffer responses of `/api/**/events` and `/api/events/**` (server-sent events).
The app rejects bodies over 1 MB, or 20 MB where files are uploaded, and bodies without
`Content-Length`. Limit them in the proxy as well (e.g. `client_max_body_size 20m`).
`GET /healthz` checks the database connection.

The links of judges and displays contain their key after `#`, which browsers never send. So it is
in no access log, neither of the app nor of the proxy.
