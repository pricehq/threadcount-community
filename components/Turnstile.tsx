"use client";
import { useEffect, useRef } from "react";

declare global { interface Window { turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void }; } }
const SITEKEY = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY || "";
export const turnstileOn = () => !!SITEKEY;

/* The token, held outside React so a form can wait for it.
 *
 * Turnstile hands its token back whenever it is ready — usually before anyone has finished typing
 * a password, occasionally a second or two later. A form that posts whatever it happens to hold
 * at submit time will sometimes post nothing, and the server answers "Please complete the security
 * check", which is both alarming and untrue. `awaitTurnstile` lets the button wait instead. */
let current = "";
const waiters = new Set<(t: string) => void>();
function publish(t: string) {
  current = t;
  if (!t) return;
  for (const w of waiters) w(t);
  waiters.clear();
}

/** The token, waiting up to `ms` for it to arrive. Resolves "" if it never does — the server
 *  refusal is the right outcome then, and it will be the honest one. */
export function awaitTurnstile(ms = 8000): Promise<string> {
  if (current) return Promise.resolve(current);
  return new Promise((resolve) => {
    const done = (t: string) => { clearTimeout(timer); resolve(t); };
    const timer = setTimeout(() => { waiters.delete(done); resolve(""); }, ms);
    waiters.add(done);
  });
}

/** Cloudflare Turnstile (managed mode): invisible for humans, a checkbox only when in doubt.
 *  Renders nothing when no site key is configured.
 *
 *  `quiet` asks Turnstile to draw nothing at all unless it actually wants an interaction. The
 *  phone's onboarding screens use it: a white Cloudflare card under the fields is the one thing
 *  on those screens that isn't ink, paper and a red rule, and for the overwhelming majority of
 *  sign-ins it is a box that says "Success" about a test nobody was aware of taking. */
export default function Turnstile({ onToken, action, quiet = false }: { onToken: (t: string) => void; action: string; quiet?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const id = useRef<string | null>(null);
  const cb = useRef(onToken); cb.current = onToken;
  useEffect(() => {
    if (!SITEKEY || !ref.current) return;
    let cancelled = false;
    const hand = (t: string) => { publish(t); cb.current(t); };
    const render = () => {
      if (cancelled || !ref.current || !window.turnstile || id.current) return;
      id.current = window.turnstile.render(ref.current, {
        sitekey: SITEKEY, action, theme: "light", size: "flexible",
        ...(quiet ? { appearance: "interaction-only" } : {}),
        callback: (t: string) => hand(t),
        "expired-callback": () => hand(""),
        "error-callback": () => hand(""),
      });
    };
    if (window.turnstile) render();
    else {
      const s = document.querySelector<HTMLScriptElement>("script[data-turnstile]") || Object.assign(document.createElement("script"), { src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", async: true, defer: true });
      if (!s.dataset.turnstile) { s.dataset.turnstile = "1"; document.head.appendChild(s); }
      s.addEventListener("load", render);
    }
    return () => { cancelled = true; if (id.current && window.turnstile) { try { window.turnstile.remove(id.current); } catch { /* gone */ } id.current = null; } };
  }, [action, quiet]);
  if (!SITEKEY) return null;
  // In quiet mode the widget contributes no height until it has something to show, so it must not
  // reserve any either.
  return <div ref={ref} style={quiet ? undefined : { marginTop: 12, minHeight: 0 }} />;
}

export function resetTurnstile() { current = ""; try { window.turnstile?.reset(); } catch { /* ignore */ } }
