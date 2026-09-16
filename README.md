<p align="center"><img src="docs/banner.svg" alt="ThreadCount" width="100%"></p>

# ThreadCount

Uniform stock management for hospital, aged-care and clinic linen rooms. It tracks what is on the
shelf, who was issued what, what each ward was charged, and the supplier orders and stocktakes in
between. It was written by a uniform coordinator for their own linen room.

This is the Community edition: the same product that runs at [threadcount.tech](https://threadcount.tech),
packaged for a facility or health service that wants to run it on its own server. Every feature a
room uses is in it. Install takes about five minutes on a server that already has Docker; the
steps are below, and the longer guide is [docs/self-hosting.md](docs/self-hosting.md).

## What you get

- **The coordinator app** at `/app`: catalogue, stock, issuing against entitlement, orders and
  receiving, stocktakes, nine reports, CSV import and export, full JSON backup and restore.
- **The phone counter** at `/m`: camera barcode scanning, issue at the counter, count by shelf,
  pickups and delivery rounds.
- **The staff app** at `/my`: staff see their own kit, request garments, managers approve.
- The two Android apps on Google Play can be pointed at your server (see below).

Not included: the threadcount.tech website, multi-site health-service features, single sign-on,
and card payments. Those belong to the hosted service.

## Or let us host it

If you would rather not run a server, the hosted service is the same product with backups kept
for 35 days, a 99.5% availability target, support response times in writing, and card or invoice
billing. A room under 60 staff records is hosted free; a facility is $129 a month or $1,290 a
year after a 30-day trial with no card. See [threadcount.tech/pricing](https://threadcount.tech/pricing)
and the [Service Level Agreement](https://threadcount.tech/sla).

## Requirements

- A Linux server with Docker and Docker Compose (2 CPU, 2 GB RAM is plenty to start).
- A hostname pointing at it, with HTTPS in front (Caddy, nginx or Traefik). The app sets secure
  cookies, so sign-in will not work over plain HTTP from another machine.

## Install

```sh
git clone https://github.com/pricehq/threadcount-community.git
cd threadcount-community
cp .env.example .env
```

Open `.env` and set these four. Everything else can stay blank.

| Setting | What to put |
|---|---|
| `SESSION_SECRET` | A long random string. `openssl rand -base64 48` makes one. The server refuses to start with the placeholder. |
| `POSTGRES_PASSWORD` | Any long password. It is only used between the two containers. |
| `NEXT_PUBLIC_SITE_URL` | The address people will type, for example `https://uniforms.example.health`. |
| `EDITION` | `community` |

Then build and start it:

```sh
docker compose up -d --build
```

The first start takes a few minutes: it builds the image, creates the database and applies the
schema. When `docker compose ps` shows the `app` container as healthy, it is ready.

By default the app listens on **port 3000** on the server (change it with `APP_PORT` in `.env`).
Point your HTTPS proxy at it. A Caddyfile for that is two lines:

```
uniforms.example.health {
    reverse_proxy 127.0.0.1:3000
}
```

## First run

There is no default username or password. The first person to sign up creates the facility and
becomes its administrator.

1. Open your address in a browser. `/` sends you to `/auth`, the sign-in page.
2. Click **Create account**. Enter your name, the facility name, your email and a password.
3. You are now signed in as the facility's admin and land on the dashboard.
4. Go to **Settings**. Name your staff groups first (for example Registered Nurse, Enrolled Nurse,
   Support Services). Nothing can be issued until a facility has groups.
5. Still in Settings, open **Data** and load your catalogue, departments, staff register and
   opening stock from CSV. Templates for each file are on that screen.
6. Add a second administrator under **Settings → Account → Users** before you sign out. If the
   only admin forgets their password and no email is configured, nobody can get back in.
7. Once your facility exists, set `SIGNUPS_DISABLED=1` in `.env` and run `docker compose up -d`
   again. Nobody else can create a facility on your server after that.

Admins and issuers are both created under Settings → Account → Users. An admin can do everything;
an issuer works the counter but cannot change settings, reorder levels or barcodes.

## Phones and the Android apps

The phone counter and the staff app are the same server, on a phone:

- `https://your-host/m` for the counter (camera scanning works in Chrome and Edge)
- `https://your-host/my` for staff

The Play apps (**ThreadCount** for the counter, **ThreadCount Staff** for staff) can use your server
too. On the app's first screen tap "Server: threadcount.tech · Change", choose Self-hosted and enter
your hostname. The app checks it, saves it on that phone, and opens your server from then on.

## Email

Set the `SMTP_*` values in `.env` if you want password resets, manager approval links and
ready-to-collect notices by email. Without them the product still works; those things happen at
the counter, and the screens say so.

## Backups

`docker/backup.sh /path/to/backups` dumps the database and the photos into a dated folder and
keeps the last fourteen. Run it nightly from cron and copy the folder off the server. An admin can
also download the whole facility as one file from Settings → Data at any time.

Restore steps are in [docs/self-hosting.md](docs/self-hosting.md).

## Updating

Each release replaces the repository's history rather than adding to it, so a plain `git pull`
refuses to merge. Fetch and move to the release instead. Your `.env` is not tracked and stays put.

```sh
git fetch origin
git reset --hard origin/main
docker compose up -d --build
```

Schema changes are applied automatically before the new version starts.

## Configuration

Every setting is listed with a comment in `.env.example`. The ones most people touch:
`NEXT_PUBLIC_TERMS_URL` and `NEXT_PUBLIC_PRIVACY_URL` (point the product's terms and privacy links
at your own documents), `SMTP_*`, `SIGNUPS_DISABLED`, `APP_PORT`, and the two Turnstile keys if you
want Cloudflare's bot check on sign-in.

## Licence

Functional Source License 1.1 with Apache 2.0 as the future licence (FSL-1.1-ALv2). You can run
it for your own organisation, read it, change it and share your changes. You cannot offer it to
others as a competing uniform-management service. Each release becomes Apache 2.0 two years after
publication. Full text in [LICENSE](LICENSE).

## Security

Found a vulnerability? Email security@threadcount.tech rather than opening a public issue. The
[security page](https://threadcount.tech/security) describes how the hosted service is run and
what the questionnaire answers; a Community instance inherits the same code and the practices in
[docs/self-hosting.md](docs/self-hosting.md) are the ones that matter for yours.

## Help

Open an issue on this repository. If you would rather not run a server at all, the hosted service
is at [threadcount.tech](https://threadcount.tech).
