/* The words an organisation uses for the four things every uniform store has.
 *
 * ThreadCount began in a hospital, and its screens said "ward" and "linen room" everywhere. A hotel
 * does not have wards and a security firm does not have a linen room, so the four nouns the product
 * keeps reaching for are a setting on the facility instead of being written into the screens:
 *
 *   team  — the group a person belongs to and is charged to   (ward, department, crew, site, line)
 *   store — where stock is kept and handed out from            (linen room, uniform room, kit store)
 *   round — a delivery taken out to the teams                  (ward round, delivery round)
 *   desk  — the person on a team who sees its requests         (ward desk, team desk)
 *
 * Only what renders changes. Schema fields and code names (Staff.wardDesk, nursingGroups,
 * deliveredRound) stay as they are: renaming them is a migration that buys a reader nothing.
 *
 * Pure and client-safe — imported by screens, emails and the API alike, so no node built-ins here.
 *
 * Writing with it: prefer "the" to "a"/"an" in front of a term. "A uniform store" and "an ward" are
 * both wrong somewhere, and no rule for the article survives words people type themselves. */

export type Terms = {
  /** One team, as it reads mid-sentence: "ward", "department", "crew". */
  team: string;
  /** More than one: "wards", "departments". Asked for, not guessed — "staff" and "crew" don't take an s. */
  teams: string;
  /** "linen room", "uniform room", "kit store". */
  store: string;
  /** "ward round", "delivery round". */
  round: string;
  /** "ward desk", "team desk". */
  desk: string;
};

export const TERM_KEYS = ["team", "teams", "store", "round", "desk"] as const satisfies readonly (keyof Terms)[];

export type TradeKey = "general" | "hospitality" | "security" | "retail" | "cleaning" | "education" | "transport" | "manufacturing" | "healthcare";

/** A starting point per trade. An organisation picks one and edits any word it likes afterwards. */
export const TRADES: { key: TradeKey; label: string; terms: Terms }[] = [
  { key: "general", label: "Any organisation", terms: { team: "team", teams: "teams", store: "uniform store", round: "delivery round", desk: "team desk" } },
  { key: "hospitality", label: "Hotel or hospitality", terms: { team: "department", teams: "departments", store: "uniform room", round: "delivery round", desk: "department desk" } },
  { key: "security", label: "Security", terms: { team: "crew", teams: "crews", store: "kit store", round: "kit run", desk: "crew desk" } },
  { key: "retail", label: "Retail", terms: { team: "store", teams: "stores", store: "stockroom", round: "store run", desk: "store desk" } },
  { key: "cleaning", label: "Cleaning or facilities", terms: { team: "site", teams: "sites", store: "depot", round: "site run", desk: "site desk" } },
  { key: "education", label: "School or college", terms: { team: "department", teams: "departments", store: "uniform shop", round: "delivery round", desk: "department desk" } },
  { key: "transport", label: "Transport", terms: { team: "depot", teams: "depots", store: "depot store", round: "depot run", desk: "depot desk" } },
  { key: "manufacturing", label: "Manufacturing", terms: { team: "line", teams: "lines", store: "PPE store", round: "line run", desk: "line desk" } },
  { key: "healthcare", label: "Hospital or healthcare", terms: { team: "ward", teams: "wards", store: "linen room", round: "ward round", desk: "ward desk" } },
];

/** The words a facility gets until it chooses its own. */
export const DEFAULT_TERMS: Terms = TRADES[0].terms;

export function tradeTerms(key: string | null | undefined): Terms {
  return (TRADES.find((t) => t.key === key) ?? TRADES[0]).terms;
}

/** Which preset these words match exactly, if any — so the settings picker can show where they came from. */
export function tradeOf(t: Terms): TradeKey | null {
  const hit = TRADES.find((p) => TERM_KEYS.every((k) => p.terms[k] === t[k]));
  return hit ? hit.key : null;
}

const MAX = 40;

/** A stored value (Facility.terms, JSON, possibly null, partial or hand-edited) to a complete set.
 *  Each missing or unusable word falls back on its own, so a half-saved setting can never put a
 *  blank where a noun belongs. */
export function resolveTerms(raw: unknown): Terms {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_TERMS };
  for (const k of TERM_KEYS) {
    const v = src[k];
    if (typeof v === "string") {
      const clean = v.replace(/\s+/g, " ").trim().slice(0, MAX);
      if (clean) out[k] = clean;
    }
  }
  return out;
}

/** The same words, checked for saving. Throws a sentence a person can act on. */
export function checkTerms(raw: unknown): Terms {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!src) throw new Error("Those words weren't readable. Pick a starting point and try again.");
  for (const k of TERM_KEYS) {
    const v = src[k];
    if (typeof v !== "string" || !v.trim()) throw new Error("Every word needs filling in — each one appears on screens and slips.");
    if (v.trim().length > MAX) throw new Error(`Keep each word under ${MAX} characters.`);
  }
  return resolveTerms(src);
}

/** First letter up, for a term that starts a sentence or a label: "Ward round", "Uniform store". */
export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Every word up, for the few places that print a name rather than a phrase — the fallback
 *  facility name on a slip ("Linen Room", "Kit Store"). Leaves an all-caps word ("PPE") alone. */
export const titleCase = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

/** More than one of a round, desk or store: "ward rounds", "kit runs", "team desks". Teams have
 *  their own stored plural because people-words don't follow a rule; these compounds end in an
 *  ordinary noun, and every preset pluralises correctly this way. */
export function plural(s: string): string {
  if (/[^aeiou]y$/i.test(s)) return s.slice(0, -1) + "ies";
  if (/(s|x|z|ch|sh)$/i.test(s)) return s + "es";
  return s + "s";
}
