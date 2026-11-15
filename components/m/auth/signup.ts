/* What creating a facility asks and checks, for the counter app's sign-up. It mirrors
 * components/AuthForm.tsx (the website's three steps) field for field and rule for rule, and posts
 * the same body to the same /api/auth/signup, which checks all of it again; AuthForm could take its
 * copies from here. The swatch colours are the site's trade cloth. */
import { TRADES } from "@/lib/terms";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Four bars: length 8, length 12, mixed case, a digit or symbol. A sentence scores full marks. */
export function strength(pw: string): { score: number; word: string } {
  const score = [pw.length >= 8, pw.length >= 12, /[a-z]/.test(pw) && /[A-Z]/.test(pw), /\d|[^\w\s]/.test(pw)].filter(Boolean).length;
  return { score, word: ["Too short", "Weak", "Fair", "Good", "Strong"][pw.length < 8 ? 0 : score] };
}

/** Each kind of organisation as a swatch of its trade's cloth: [background, text on it]. */
const CLOTH: Record<string, [string, string]> = {
  hospitality: ["#33353b", "#ffffff"],
  security: ["#e3f03a", "#14161b"],
  retail: ["#2f7d4f", "#ffffff"],
  cleaning: ["#1f8a8a", "#ffffff"],
  education: ["#7a1f35", "#ffffff"],
  transport: ["#6aa2d8", "#14161b"],
  manufacturing: ["#f0f3f5", "#14161b"],
  healthcare: ["#1d3a66", "#ffffff"],
  general: ["#d42a12", "#ffffff"],
};

/** The trades as the sign-up offers them: the named ones, then "Something else" (general). */
export const KINDS: { key: string; label: string; sw: string; fg: string }[] = [
  ...TRADES.filter((t) => t.key !== "general").map((t) => ({ key: t.key as string, label: t.label, sw: CLOTH[t.key]?.[0] ?? "#33353b", fg: CLOTH[t.key]?.[1] ?? "#fff" })),
  { key: "general", label: "Something else", sw: CLOTH.general[0], fg: CLOTH.general[1] },
];

export function cloth(key: string): { sw: string; fg: string } {
  const k = KINDS.find((x) => x.key === key);
  return k ? { sw: k.sw, fg: k.fg } : { sw: "#14161b", fg: "#ffffff" };
}

/** State or territory — sets the time zone for counts and month-end, nothing else. */
export const STATES: [string, string][] = [["QLD", "Queensland"], ["NSW", "New South Wales"], ["VIC", "Victoria"], ["ACT", "Australian Capital Territory"], ["TAS", "Tasmania"], ["SA", "South Australia"], ["NT", "Northern Territory"], ["WA", "Western Australia"], ["NZ", "New Zealand"]];

export type SignupForm = { first: string; last: string; facility: string; email: string; pw: string; setting: string; state: string };

/** The body /api/auth/signup takes — the same keys AuthForm sends. */
export function signupBody(f: SignupForm, agreed: boolean, cfToken: string) {
  return { first: f.first, last: f.last, facility: f.facility, email: f.email, password: f.pw, setting: f.setting, state: f.state, agreed, cfToken };
}
