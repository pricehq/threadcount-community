---
title: Email
section: selfhost
order: 5
summary: The SMTP settings, every email the product sends, what each screen does when no mail is configured, and how to test it.
role: Self-hosting admin
keywords: email, mail, smtp, password reset, approval link, notifications, ready to collect, supplier order, orders, order and email, no-reply, from address, test email
---

## The settings

Email is optional. It is set with five variables in `.env`:

| Setting | Required for mail | What it does |
|---|---|---|
| `SMTP_HOST` | Yes | Your mail server's hostname |
| `SMTP_PORT` | No | Defaults to `587`. On `465` the connection uses TLS from the start; on any other port it starts plain and upgrades if the server offers it. |
| `SMTP_USER` | Yes | The login for the mail server |
| `SMTP_PASS` | Yes | The password for that login |
| `SMTP_FROM` | No | The From line, e.g. `"ThreadCount <no-reply@example.health>"`. If blank, `SMTP_USER` is used. |

Mail counts as configured only when `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` are all set. A mail server that needs no login cannot be used.

These are read while the app runs, not when it is built, so a change needs a restart but no rebuild:

```sh
docker compose up -d
```

Links in emails are built from `NEXT_PUBLIC_SITE_URL`, which is compiled in. If the links are wrong, fix that setting and rebuild with `docker compose up -d --build`.

## What is sent

| Email | Sent to | When |
|---|---|---|
| Facility set up | The person who signed up | A facility is created |
| Password reset | An admin or issuer | They ask on the sign-in page. The link works once and expires in 1 hour. |
| Uniform request needing approval | The manager, with a link to approve | A request is raised in the staff app, or re-addressed to another manager from the queue at `/app/requests` |
| Decision | The person the request is for | A manager approves or declines, or someone uses Withdraw it in the requests queue |
| Ready to collect, or coming on the round | The person the request is for | The request is held at the counter or sent on the ward round from the requests queue |
| Waitlist offer | The person on the waitlist | A garment is offered to them, with the time it is held until |
| Supplier order | The supplier's email under `Settings › Catalogue & suppliers` | An admin uses Order and email on `Orders`, or Email supplier on the order's page. Replies go to that admin's address. |

Staff notices go only to people whose staff app login has an email address. See [the staff app](/docs/apps/staff-app) and [requests from staff](/docs/counter/requests-from-staff).

When an admin adds a user, the product does not email them their password.

## With no mail configured

Nothing is sent, and the log records `[mail] no SMTP configured — not sending:` followed by the subject. The work itself is still recorded.

- **Sign-up.** The facility is created. The screen says no mail is configured, so the address has not been checked.
- **Requests and decisions.** The request is raised and the decision is recorded. When someone raises a request in the staff app, the screen says their manager hasn't been emailed. After a decision on the approval-link page, it says the wearer hasn't been emailed. A decision made in the staff app does not say whether the wearer was emailed. The requests queue in the coordinator app does not show whether anyone was emailed.
- **Supplier orders.** The order is still raised, but it is not emailed. The screen says "Email is not set up on this server — print the order instead."
- **Password reset.** No link is sent, but the sign-in page still shows "Reset link sent". The only way back in is another admin setting a new password under `Settings › People & sign-in`.

> **Careful** Without mail, a facility whose only admin forgets their password cannot get back in through the product. Keep a second admin.

## When sending fails

If mail is configured but the server refuses a message, the action that caused the email still succeeds and `[mail] send failed:` is logged with the reason. Emailing a supplier order is the exception: the screen says "The email could not be sent — try again in a minute, or print the order." and the order is not marked as emailed. Print and CSV stay on the order.

## Test it

1. **Restart after setting the variables.** Run `docker compose up -d`.
2. **Ask for a password reset for your own address.** On the sign-in page, enter your email and use the forgot-password link.
3. **Check the inbox and the log.**

```sh
docker compose logs app | grep '\[mail\]'
```

If a reset email arrives and there is no `[mail]` line, mail works. At most 4 reset emails go to one address in an hour. Check that the link in the email starts with your own address, not `http://localhost:3000`.
