---
title: Single sign-on
section: account
order: 3
summary: Connect your facility's identity provider, route people to it by email domain, make it optional or required, and keep a break-glass admin.
screen: Settings › People & sign-in
role: Admin
keywords: single sign-on, SSO, SAML, OpenID Connect, OIDC, Microsoft Entra, Azure AD, Okta, Google Workspace, identity provider, IdP, email domain, required, break-glass, metadata, disconnect
---

## What it does

Single sign-on lets the people at your facility sign in with the work account they already have, through your own identity provider: Microsoft Entra, Okta, Google Workspace, or any provider that speaks SAML or OpenID Connect.

An admin sets it up for one facility under the `Single sign-on` heading on `Settings › People & sign-in`. On a server with no sign-on service it says `Single sign-on isn’t available on this server.` It is not offered in the demo. Users who are not admins see one line saying whether the facility uses it.

Single sign-on never creates an account. The address your identity provider returns must already belong to an active user at your facility, added as described in [Users and passwords](/docs/account/users). Anyone else is told that the address has no account at this facility yet.

## Connect your identity provider

1. **In your identity provider, add an application for ThreadCount.** The panel shows the two values it asks for: the ACS or redirect URL, ending in `/api/auth/sso/callback`, and the Entity ID.
2. **Give ThreadCount the provider's metadata.** Paste its `Metadata URL`, which must start with `https://`, or paste the XML into `…or metadata XML`.
3. **List your email domains,** comma-separated. A domain is the part after the @, such as `example.com`.
4. **Press `Connect single sign-on`.**

The metadata is handed to the sign-on service and not shown again. The panel then reads `Connected`, with the provider's name when it has one. A later change to the domains is saved with `Save domains`.

Domains are checked each time they are saved:

- 10 at most.
- Public mail services such as `gmail.com` and `outlook.com` are refused.
- A domain belongs to one facility. One already registered elsewhere is refused.

| Record | Change | Undo |
|---|---|---|
| Facility | Connected, domains saved | `Disconnect single sign-on…` |
| Facility | `Require` or `Staff may use it too` switched | Untick it |
| User | Marked break-glass | Untick it |
| Facility | Disconnected, every switch off | Connect again |

## Routing by email domain

ThreadCount has one Log in screen for every facility, so it routes by address. When someone types an address ending in one of your domains, the screen offers `Continue with` and your facility's name. That button takes them to your identity provider, and they come back signed in.

A sign-in through your identity provider asks for no ThreadCount two-factor code. A deactivated user is refused.

## Optional or required

Once connected, single sign-on is optional. The Log in screen offers the button first, and `Prefer your password?` lets a user sign in with a password instead.

Tick `Require single sign-on` and:

- a correct password is refused for every user except break-glass admins, and the Log in screen sends them to single sign-on;
- password reset emails stop, except for break-glass admins.

`Require single sign-on` is refused until at least one active admin is marked break-glass.

## The break-glass admin

Under `Break-glass admins`, tick each admin who keeps a working password for the day the identity provider is down. Only admins are listed. On the Log in screen they open `Break-glass admin? Sign in with a password instead`.

> **Careful** A break-glass admin is the only way in while the identity provider is down. Keep that password, and that admin's two-factor, working.

## Staff sign-ins

Tick `Staff may use it too` and wearers who already have a staff sign-in can use single sign-on. They type their address on the website's Log in screen and land in their own staff view.

This is web only. The ThreadCount Staff app keeps their password, and `Require single sign-on` does not turn staff passwords off. See [The staff app](/docs/apps/staff-app).

## Disconnect

Press `Disconnect single sign-on…`, then `Disconnect`, or `Keep it` to back out. The connection is removed from the sign-on service, and `Require` and `Staff may use it too` are switched off. Everyone goes back to signing in with a password.
