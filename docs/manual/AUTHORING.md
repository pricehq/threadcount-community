# Writing the ThreadCount manual

The manual is the set of Markdown files under `docs/manual/<section>/<slug>.md`. The website
renders them at `/docs/<section>/<slug>` and the app renders the same files at
`/app/help/<section>/<slug>`, so one file serves both. The Community edition ships the folder.

## The one rule

**Every sentence must be true of the code as it is today.** Read the screen, the API route and
the library before you describe them. If you cannot verify a behaviour by reading the code, leave
it out. Never describe a feature that is planned, and never soften a limitation. Where a figure
comes from a constant (`lib/sets.ts`), quote the constant's value.

## Front matter

```
---
title: Issue a garment
section: counter
order: 1
summary: Scan the garment, pick the person, record it. What is written, and what the counter refuses.
screen: Counter
role: Admin or Issuer
keywords: issue, scan, barcode, six sets, refusal, slip
---
```

- `section`: one of `start`, `counter`, `stock`, `people`, `reports`, `apps`, `account`,
  `selfhost`, `reference`. Fixed list; the tree is built from it.
- `order`: position within the section, from 1.
- `summary`: one sentence, shown in the tree's search results and on the section index.
- `screen`: the app menu label or path the page is about, e.g. `Settings › Data & audit log`. Omit if none.
- `role`: who can do it. One of `Admin`, `Admin or Issuer`, `Staff`, `Anyone`, `Self-hosting admin`.
- `keywords`: comma-separated words a coordinator would type into search. Include the words the
  screens use AND the words a newcomer would use ("stocktake, count, audit").

## Body

Plain Markdown, this subset only:

- `## Heading` for sections. They are numbered automatically and listed in the rail. Four to
  seven per page. No `#` or `###`.
- Paragraphs. Short. One idea each.
- `- item` bullet lists and `1. step` numbered lists (steps: bold the action first,
  `1. **Scan the garment.** Then…`).
- Tables with `|`, a header row, then `|---|` then rows. Keep to four columns.
- Fenced code blocks with three backticks for commands and file contents.
- Callouts: a blockquote whose first line is a bold label.
  `> **In plain terms** One sentence.` (navy: commentary)
  `> **Careful** One sentence.` (red: a way to lose data or lock yourself out)
  `> **In ThreadCount** …` is only for the guides; do not use it here.
- Inline `code` for settings, file names and values. Screen paths in code too: `Settings › Data & audit log`.
- Links: `[text](/docs/stock/barcodes)` to other manual pages, `[text](/data-security)` to the site.
- **Bold** sparingly, never for whole sentences. No italics, no emoji, no headers inside callouts.

## Voice

- Australian English. Second person for the reader ("you issue"), the product by name or "it".
- Say what the screen does, then what it writes, then what it refuses and why. The
  "What is written" table (Record · Change · Undo) belongs on every page about an action.
- Numbers as digits. Times as `07:40`. Dates as `13 Sep 2026`.
- No marketing, no adjectives about the product, no "simply", no "just". The manual explains.
- The screens say whatever a facility chose under `Settings › Facility › Words` (`lib/terms.ts`).
  Quote them in the general words — team, teams, uniform store, delivery round, team desk — and
  never as ward, linen room or ward round. [Your words](/docs/start/your-words) says so once.
- Sample data: the fictional **Riverside General** hospital, cost centres `RGH-4010` style,
  suppliers **Northline Workwear** and **Harbour Embroidery** only, people like A. Hassan and
  P. Nair, addresses at `example.com`. Never a real hospital, health service, supplier or person.

## Where to look

| Area | Read |
|---|---|
| Screens | `app/app/<screen>/page.tsx` and the components they import |
| Mutations | `app/api/mutate/route.ts` and `lib/ops.ts` (the `op` names and their checks) |
| Rules | `lib/sets.ts` (entitlement), `lib/switches.ts` |
| Data | `prisma/schema.prisma` |
| Imports | `lib/csv.ts`, `app/api/import*`, `Settings › Data & audit log` in `components/settings/DataAudit.tsx` |
| Phone apps | `app/m/**` (counter app), `app/my/**` (staff app), `lib/nativescan.ts` |
| Self-hosting | `README.md`, `docker-compose.yml`, `.env.example`, `Dockerfile`, `lib/edition.ts` |
| Users and signing in | `components/settings/PeopleSignIn.tsx`, `components/TwoFactor.tsx`, `components/AuthForm.tsx` |
| What each email says | `lib/accountmail.ts`, `lib/approvallink.ts` |

## Hard constraints

- Never name a real hospital, health service, government health department or uniform supplier,
  not even as an example. Use Riverside General, Northline Workwear, Harbour Embroidery.
  `scripts/check-identity.sh` and the manual linter both fail a page that does.
- No email addresses, and never a person's name or job. The software is "ThreadCount" or "the
  project", never someone who wrote it. Questions go to the issue tracker at
  `https://github.com/pricehq/threadcount-community/issues`.
- Never copy a secret, key or token into a page.
- Read-only for these files, never edit them: `app/m/**`, `app/my/**`, `components/screens/**`,
  `components/m.tsx`, `components/my.tsx`, `components/staffui.tsx`, `components/staffnav.tsx`,
  `components/MAuth.tsx`, `components/MPerson.tsx`, `components/MScan.tsx`, `androidshell/**`,
  `staffshell/**`.
- Write only inside your own section folder. Do not run git, the dev server or a build.
- Length: 400 to 900 words a page, 4 to 7 `##` sections. The CSV reference may run to 1400.

## Every page in the manual

Link only to these. A link to anything else is a broken link.

| Section | Slugs, in order |
|---|---|
| `start` | threadcount-in-one-page, set-up-in-an-afternoon, the-two-roles, your-first-order, your-words |
| `counter` | issue-a-garment, exchanges-and-returns, requests-from-staff, manager-approvals, pickup-call-list, delivery-rounds, slips-and-signatures |
| `stock` | catalogue-sizes-and-cuts, barcodes, reorder-levels, stocktakes, order-list, receiving-and-back-orders, suppliers |
| `people` | staff-register, groups-and-routes, entitlement-rule, managers, deactivating-and-deleting |
| `reports` | the-nine-reports, cost-centres, journal-export, month-end-pack |
| `apps` | counter-app, staff-app, scanning-and-browsers |
| `account` | users, two-factor, export-and-backup, delete-an-account |
| `selfhost` | install, first-run, updating, backups, email, configuration-reference, notifications |
| `reference` | csv-templates, glossary, keyboard-and-scanner |

A manual link is `/docs/<section>/<slug>`. Site pages you may also link: `/`, `/what-it-does`,
`/compare`, `/docs`, `/data-security`, `/privacy`, `/delete-account`, `/changelog`,
`/demo`, and the guides under `/guides/`.

## When you finish

Reply with the files written, then a short list of anything you could not verify in the code and
therefore left out. That list is how the manual's gaps get found, so be specific.
