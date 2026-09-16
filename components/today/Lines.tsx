"use client";
import { Fragment } from "react";

/** "Softshell Jacket · L ×1, EN Scrub Top · L ×2" with the sizes in mono. */
export function Lines({ lines }: { lines: { garment: string; size: string; qty: number }[] }) {
  return (
    <>
      {lines.map((l, i) => (
        <Fragment key={i}>
          {i > 0 && ", "}
          {l.garment} · <span className="tc-mono">{l.size}</span> ×{l.qty}
        </Fragment>
      ))}
    </>
  );
}
