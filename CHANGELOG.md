# Changelog

What changed in each Community release, newest first. Each heading is the date a release was cut. Its tag is `v` followed by that date, such as `v2026.09.17`, with `.2` added if a second release went out the same day.


## 2026-09-17

The first tagged release. Earlier Community builds were published without tags.

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
