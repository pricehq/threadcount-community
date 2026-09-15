"use client";

/* Community edition: single sign-on is part of the hosted service (it needs the broker
 * threadcount.tech runs). The settings screen still has a place for it, so this says so. */
type Props = { isAdmin: boolean; demo: boolean; sso: { enabled: boolean; required: boolean; staff: boolean; domains: string[] }; users: unknown[]; onChanged: () => void; mutate: unknown };
export default function SsoSettings(_: Props) {
  void _;
  return (
    <div style={{ fontSize: 13, color: "var(--color-neutral-700)", lineHeight: 1.6, marginTop: "var(--space-3)" }}>
      Single sign-on through an identity provider is not part of the Community edition. Coordinators sign in with a password and, where enrolled, an authenticator code.
    </div>
  );
}
