The first tagged release. Earlier Community builds were published without tags.

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
