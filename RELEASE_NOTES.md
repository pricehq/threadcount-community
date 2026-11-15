The first release since September. It gathers eight weeks of fixes and security updates.

### Fixed

- The sign-in and sign-up forms ran off the right-hand edge of a phone narrower than 440 pixels.
  They now fit the screen.
- A garment type typed by hand, such as `Top`, `Scrub Tops` or `Slacks`, counts as half of a set
  the same way the built-in types do, so the sets a person holds add up.
- Deleting the last admin, which deletes the facility, no longer logs two errors after it succeeds.
- A phone screen that lost its connection picks up again when the signal returns, without a reload.
- A garment taken off a request reads `Withdrawn`.

### Added

- Outgoing email is queued in the database and retried when the mail server is busy, with an hourly
  cap. `EMAIL_RATE_PER_HOUR`, `EMAIL_URGENT_RESERVE` and `EMAIL_ALERT_WEBHOOK` in `.env.example`
  describe the settings; it works with none of them set.
- Every error screen shows a short code, `TC-` and eight characters, that matches a line in the
  server log.
- A counter user can delete their own account from the phone, a staff member can delete their own
  sign-in, and a staff member can withdraw a request that is still waiting on their manager.

### Security

- Pages are served with a content-security policy that runs only scripts carrying that page load's
  nonce. `CSP_REPORT_ONLY=1` switches it to reporting without a rebuild if a customisation of yours
  needs time to catch up.
- Security updates to Next.js (16.4.5) and nodemailer (10.1.4), with the routine dependency updates
  since September.

### Upgrading

- One migration adds the `MailJob` table for the email queue. Run `prisma migrate deploy` as usual;
  the Docker setup does it on start.
