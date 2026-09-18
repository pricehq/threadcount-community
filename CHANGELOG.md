# Changelog

What changed in each Community release, newest first. Each heading is the date a release was cut. Its tag is `v` followed by that date, such as `v2026.09.17`, with `.2` added if a second release went out the same day.


## 2026-09-18

ThreadCount is now a uniform system for any organisation that issues uniform: hotels, security
crews, retail, cleaning and facilities, schools, transport, manufacturing and healthcare.

### Your own words

- The words the screens use for a team, the place stock is kept, a delivery run and the person on
  a team who signs for it are a setting on the facility, under `Settings › Facility › Words`.
- `Starting point` offers a set for each kind of organisation, and every word can be edited. The
  coordinator screens, the counter app, the staff app, slips, emails, phone notifications and
  exports all use them.
- Sign-up asks for the kind of organisation and fills the words in from it. The old setting answers
  (hospital, aged care, community health) still work and choose the healthcare words.
- The words are display only. Records, departments, cost centres and history are unchanged.

### Upgrading

- One migration adds a `terms` column to `Facility` and gives every existing facility the
  healthcare words, so an upgraded install reads exactly as it did. Choose another starting point
  under `Settings › Facility › Words` to change them. New facilities start from the kind of
  organisation chosen at sign-up, or the general set (team, uniform store, delivery round, team desk).
- A second migration removes what was left of the plan, billing, card-payment and multi-facility
  organisation layer: nineteen unused columns on `Facility`, one on `PlatformSwitch`, and the
  `Organisation`, `OrgUser`, `OrgCatalogItem`, `OrgSupplier`, `OrgEvent` and `PlanMail` tables.
  Nothing has read them since the last release. Organisation-wide single sign-on goes with them;
  single sign-on per facility is unchanged. Take a backup before upgrading if you want a copy.
- The manual has a new page, Your words, and quotes screens in the general words.

## 2026-09-17

Everything that limited what a facility may do has been taken out. If you are already running
ThreadCount, this release only ever gives you more than you had.

### No plans, no ceilings, nothing to pay

- There are no plans, tiers, trials, grace periods or read-only states, and no code left that could
  refuse a write because of any of them. Every facility has every feature, permanently.
- The staff register has no ceiling. Importing a roster from CSV no longer stops part way through
  and skips the rest — every row in the file is imported.
- Settings is now six sections; the Plan tab is gone, along with the card, invoice and billing
  screens behind it.
- Sign-up is three steps ending in Confirm, with nothing to choose between and no card asked for.

### The documents

- The terms you have ThreadCount under are the AGPL itself. The separate Terms of Service, Service
  Level Agreement and Acceptable Use policy have been withdrawn.
- The Privacy Policy and Data Security pages are rewritten for software you run yourself: the
  records are on your server, the backups are yours to take and to test, and the published edition
  reports nothing to anyone. Both carry a revision note saying what changed.
- `NEXT_PUBLIC_TERMS_URL` and `NEXT_PUBLIC_PRIVACY_URL` still point the product's own links at your
  facility's documents, and are still build arguments in `docker-compose.yml`.

### Documentation and apps

- The manual is corrected throughout; the configuration reference no longer lists variables the
  product does not read, and now documents `SOURCE_URL`.
- The phone apps treat your own server as the ordinary case rather than the exception.

### Under the hood

- New column `Issue.cc`: the cost centre an issue was charged to, frozen when it was issued, so
  moving somebody between wards no longer re-attributes garments they were issued in the past. The
  migration adds the column with an empty default and existing rows keep falling back to the
  wearer's current department, so no figure you have already reported moves.

The rest of this section went out earlier the same day, in the first tagged release. Community
builds published before that one carried no tags.

### Licence: now AGPL-3.0-only

- ThreadCount Community is now under the **GNU Affero General Public License v3**, an OSI-approved
  open source licence. It was previously the Functional Source Licence, which was source-available
  but not open source. Run it, read it, change it, fork it; the one obligation is the copyleft one,
  that a modified version you run for other people must let those people have your changes.
- Releases published before this one remain under the earlier licence.
- The sign-in page and the app now carry the licence's offer of source: the build you are running
  and a link to its code. Set `SOURCE_URL` if you run a modified build, so it points at yours.
- `CONTRIBUTING.md` asks contributors for a Developer Certificate of Origin sign-off. It is a
  sign-off, not a copyright assignment — you keep the copyright in your work.
- The ThreadCount name and logo are not covered by the licence; a fork needs its own name.
- The README now opens with the live demo and shows what the product looks like.

### Phone counter (`/m`)
- Rebuilt around one scanner. A staff badge opens that person, a garment opens its stock line, and a shelf label starts a count of that shelf.
- Issuing is a basket of the person's kit in their size, with tops and pants counted against the sets limit as you add. A line that breaks a rule needs a reason.
- A hand-over can be signed on the glass, and the slip can be sent to the person's staff app.
- Hand back takes several garments at once, each with a condition and an optional size swap.
- A Work tab collects approved requests to pick, deliveries to receive, pickups and ward rounds.
- The Android app prints labels through Android's print service. Shelf labels can be printed and scanned to start a count.
- Counting has a hands-free switch, and every gap over the facility threshold needs a reason before the count is committed.

### Staff app (`/my`)
- Notifications for approved or declined requests, ready to collect, bags on the ward round, kit checks, and for approvers anything waiting on them. They need a Firebase project on your server: see Self-hosting, Notifications in the manual. Without one the app says notifications are not set up.
- A Messages tab listing every thread with the linen room.
- A Team tab for approvers and ward desks: approve from the queue, the ward roster, raising for your team, and the ward round with progress on "Sign for all".
- Asking for a garment is one screen, with what you already hold first and "Same again" to repeat your last request.
- Signed slips show quantities.
- An offline bar keeps what you typed while the signal is gone.

### Coordinator app (`/app`)
- Rebuilt around seven sections: Today, Counter, Stock, Orders, People, Reports and Settings, with a search-and-scan bar.

### Sign-in and sign-up
- A terms and privacy tick box on sign-in and on the first sign-up step, shown when your server sets `NEXT_PUBLIC_TERMS_URL` or `NEXT_PUBLIC_PRIVACY_URL`.
- Where Turnstile is configured, its check is visible on the password step and on the last sign-up step.

### Updating
- This release adds database migrations. They run by themselves during `docker compose up -d --build`. Take a backup first, as the updating guide describes.
