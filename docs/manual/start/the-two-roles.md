---
title: The two roles
section: start
order: 3
summary: What an Admin can do that an Issuer cannot, as the server enforces it, and what staff see when they sign in to the staff app.
screen: Settings › People & sign-in
role: Anyone
keywords: roles, permissions, admin, issuer, access, user, users, staff sign-in, staff app, activation code, who can
---

## Two roles, checked on the server

Every user of the linen-room app is either `Admin` or `Issuer`. The server checks the role on every change, so hiding a button is not the only protection. If an Issuer attempts a change they are not allowed to make, the server refuses it with `Admin only`, whichever screen it came from.

Your name and role are at the foot of the menu, or at the bottom of the `More` sheet on a phone. A sign-in lasts 14 days, or 30 days if you tick to stay signed in on that computer. Changing a password ends every older sign-in for that user.

## What each role can do

An Admin can do everything an Issuer can, plus everything in the Cannot column. The one thing an Admin cannot do is remove or demote the last active Admin.

| Role | Can | Cannot |
|---|---|---|
| Issuer | Issue, return, swap sizes and take hand-ins on `Counter` | Add, edit or delete catalogue items, sizes or barcodes |
| Issuer | Work requests, pickups and delivery rounds | Change reorder levels, supplier codes or catalogue prices |
| Issuer | File a count on `Stock › Count`, receive stock, add to the pre-loved pool | Set on hand, adjust or write off stock, or set opening balances |
| Issuer | Create an order with `New order` or `Order for a person`, and receive deliveries | Raise the `To order` list, email a supplier or cancel an order |
| Issuer | Read `People` and `Reports` | Add, edit or delete staff, departments or locations, or generate staff-app codes |
| Issuer | Read `Settings`, where the fields are disabled | Change settings, staff groups, suppliers or users |
| Issuer | Change their own details and password | Read the audit log, import CSV, restore a backup, wipe or reset data |

On `Orders`, an Issuer sees `Recent orders` where an Admin sees `To order`. The `Mark ordered` and `Order sheet` buttons on an order, and `Mark shipped` in its menu, are shown to Admins only.

## Managing users

Admins see the `Users` list under `Settings › People & sign-in`, with `Add user` and an `Edit` button on each row. The user dialog's `Role` sets `Admin` or `Issuer`. The facility must always have at least one active Admin, so the server will not demote or remove the last one and replies `Keep at least one active admin`. See [Users](/docs/account/users).

## Staff sign-ins

Staff on the register are not users, and they never have either role. A staff member signs in to the staff app, at `/my`, with a separate account.

1. **An Admin generates a code** on the person's record, under `People › Details & access`, in the `Staff app` panel. It is twelve characters in three groups, and `Print the slip` prints it.
2. **The staff member activates it** at the staff sign-in with `First time? I have a code`, then chooses an email and password. A code generated 14 or more days ago is refused as expired.
3. **After that they sign in** at the staff sign-in, or through the ordinary sign-in on the website.

A staff sign-in lasts 30 days. It is a different kind of session from a user's, so it cannot open the linen-room app. A user's session shows nothing in the staff app either.

## What staff can see

The bar at the bottom of the staff app is `Home`, `My kit`, `Orders` and `Messages`. In it, staff can:

- see what they hold and raise a request for garments
- send messages about their own requests, report damage and raise a dispute
- join, leave or accept a waitlist place, and answer a kit check when one is open
- change their own password, and turn notifications on or off, under `Account`

Extra views come from the register, not from a role, and they arrive as a fifth item in the bar. If someone is named as another person's manager, they also see approvals, their team's ward list and `Raise` for the people who report to them. If someone is marked `On the ward desk`, they see the ward round for their ward. Anybody a request is addressed to sees the approvals tab even when they manage nobody else.

## What is written

| Record | Change | Undo |
|---|---|---|
| User role | `Admin` or `Issuer`, set under `Settings › People & sign-in` | Set it back, as long as one active Admin remains |
| Staff activation code | Generated on the person's record, stamped with the date | `Cancel the code`; it expires after 14 days anyway |
| Staff account | Created when the code is used | `Remove access` on the record, which ends its sign-ins |

If a staff member is deactivated on the register, they lose the staff app at once. When they try to sign in they are told `You're no longer on the register at this facility. Ask the linen room.`
