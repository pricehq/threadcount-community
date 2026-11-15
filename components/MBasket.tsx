"use client";
/* The counter phone's work in progress between a screen and its Sign step: the lines being issued to
 * somebody, what they are handing back, what has been picked off a request, and how many sets come
 * off a manager's approval.
 *
 * Memory, mirrored to sessionStorage so a reload or the Android back button does not throw a half
 * built basket away. It is NOT an offline queue: nothing in here is ever sent to the server until the
 * person presses the bar, and it is cleared on sign out alongside the open counts. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSnap } from "@/lib/client";

export type IssueLine = { key: string; itemId: string; si: number; qty: number; reason: string | null };
export type BackLine = { uid: string; itemId: string; si: number; cond: "Good" | "Damaged" | "Condemn" | "Lost"; swapSi: number | null };

type State = {
  issue: Record<string, IssueLine[]>;
  back: Record<string, BackLine[]>;
  picked: Record<string, Record<string, number>>;
  deduct: Record<string, number | null>;
};
const EMPTY: State = { issue: {}, back: {}, picked: {}, deduct: {} };

export type Basket = {
  issue: (staffId: string) => IssueLine[];
  setIssue: (staffId: string, lines: IssueLine[]) => void;
  back: (staffId: string) => BackLine[];
  setBack: (staffId: string, lines: BackLine[]) => void;
  picked: (requestId: string) => Record<string, number>;
  setPicked: (requestId: string, p: Record<string, number>) => void;
  deduct: (staffId: string) => number | null;
  setDeduct: (staffId: string, n: number | null) => void;
  clear: (kind: "issue" | "back" | "picked", id: string) => void;
};

export const basketKey = (userId: string) => `tc.basket.${userId}`;

/** Forget this person's basket on the device (sign out). The in-memory copy goes with the page. */
export function clearBasket(userId: string) {
  try { sessionStorage.removeItem(basketKey(userId)); } catch { /* storage blocked: nothing kept */ }
}

const NONE_ISSUE: IssueLine[] = [];
const NONE_BACK: BackLine[] = [];
const NONE_PICKED: Record<string, number> = {};

const BasketContext = createContext<Basket | null>(null);

export function MBasketProvider({ children }: { children: React.ReactNode }) {
  const { s } = useSnap();
  const userId = s.session.userId;
  const [st, setSt] = useState<State>(EMPTY);
  const loaded = useRef(false);

  // Read after mount: the server render has no sessionStorage, and reading during render would make
  // the first paint disagree with the server's.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(basketKey(userId));
      if (raw) {
        const j = JSON.parse(raw) as Partial<State>;
        setSt({ issue: j.issue || {}, back: j.back || {}, picked: j.picked || {}, deduct: j.deduct || {} });
      }
    } catch { /* unreadable or blocked: start empty */ }
    loaded.current = true;
  }, [userId]);

  useEffect(() => {
    if (!loaded.current) return;
    try { sessionStorage.setItem(basketKey(userId), JSON.stringify(st)); } catch { /* blocked: memory only */ }
  }, [st, userId]);

  const setIssue = useCallback((id: string, lines: IssueLine[]) => setSt((x) => ({
    ...x, issue: { ...x.issue, [id]: lines },
    // A changed basket is a different number of sets, so the approval deduction is asked again.
    deduct: { ...x.deduct, [id]: null },
  })), []);
  const setBack = useCallback((id: string, lines: BackLine[]) => setSt((x) => ({ ...x, back: { ...x.back, [id]: lines } })), []);
  const setPicked = useCallback((id: string, p: Record<string, number>) => setSt((x) => ({ ...x, picked: { ...x.picked, [id]: p } })), []);
  const setDeduct = useCallback((id: string, n: number | null) => setSt((x) => ({ ...x, deduct: { ...x.deduct, [id]: n } })), []);
  const clear = useCallback((kind: "issue" | "back" | "picked", id: string) => setSt((x) => {
    const next: State = { issue: { ...x.issue }, back: { ...x.back }, picked: { ...x.picked }, deduct: { ...x.deduct } };
    delete next[kind][id];
    if (kind === "issue") delete next.deduct[id];
    return next;
  }), []);

  const value = useMemo<Basket>(() => ({
    issue: (id) => st.issue[id] || NONE_ISSUE,
    setIssue,
    back: (id) => st.back[id] || NONE_BACK,
    setBack,
    picked: (id) => st.picked[id] || NONE_PICKED,
    setPicked,
    deduct: (id) => (st.deduct[id] === undefined ? null : st.deduct[id]),
    setDeduct,
    clear,
  }), [st, setIssue, setBack, setPicked, setDeduct, clear]);

  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useBasket(): Basket {
  const c = useContext(BasketContext);
  if (!c) throw new Error("useBasket outside MBasketProvider");
  return c;
}
