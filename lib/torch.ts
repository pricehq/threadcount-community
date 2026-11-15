"use client";
/* The torch control for a live scan, shared by the Scan tab, the full-screen scanner and
 * hands-free counting.
 *
 * Found on a phone in a dim room: MLKit kept running, the screen said LIVE, and nothing was read,
 * because the camera could see nothing. From the outside that is indistinguishable from a broken
 * scanner. So the button is there from the start, and after a stretch with no read it says
 * why it might be wanted. `source` is null whenever no live session is running. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { TorchSource } from "@/lib/webscan";

/** How long a live camera goes without reading anything before the torch asks to be tried. */
const IDLE_MS = 8000;

export type Torch = { available: boolean; on: boolean; idle: boolean; toggle: () => void; sawRead: () => void };

export function useTorch(source: TorchSource | null): Torch {
  const [available, setAvailable] = useState(false);
  const [on, setOn] = useState(false);
  const [idle, setIdle] = useState(false);
  const last = useRef(0);
  const onRef = useRef(false); onRef.current = on;

  useEffect(() => {
    setOn(false);
    setIdle(false);
    last.current = Date.now();
    if (!source) { setAvailable(false); return; }
    let dead = false;
    source.has().then((a) => { if (!dead) setAvailable(a); }).catch(() => {});
    const t = setInterval(() => { if (Date.now() - last.current > IDLE_MS) setIdle(true); }, 1000);
    return () => {
      dead = true;
      clearInterval(t);
      // Leaving a screen with the torch lit should not leave the phone's flash on.
      if (onRef.current) void source.set(false);
    };
  }, [source]);

  const toggle = useCallback(() => {
    if (!source) return;
    const want = !onRef.current;
    void source.set(want).then((ok) => { if (ok) setOn(want); });
  }, [source]);

  const sawRead = useCallback(() => { last.current = Date.now(); setIdle(false); }, []);

  return { available, on, idle, toggle, sawRead };
}
