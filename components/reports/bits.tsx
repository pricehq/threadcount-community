"use client";
/* Small pieces every Reports tab shares: the CSV / Print pair on a panel head, a table frame, and
 * an empty line that sits inside a panel's padding. */
import { Empty } from "@/components/ui";

const mini: React.CSSProperties = { minHeight: 0, padding: 0 };

export function HeadActions({ name, aside, onCsv, onPrint, csvText = "CSV", csvSecondary }: {
  name: string; aside?: React.ReactNode; onCsv?: () => void; onPrint?: () => void; csvText?: string; csvSecondary?: boolean;
}) {
  return (
    <span className="tc-rep-headacts">
      {aside && <span>{aside}</span>}
      {onCsv && (csvSecondary
        ? <button type="button" className="btn btn-secondary" onClick={onCsv}>{csvText}</button>
        : <button type="button" className="btn btn-ghost" style={mini} onClick={onCsv} aria-label={`Download ${name} as CSV`}>{csvText}</button>)}
      {onPrint && <button type="button" className="btn btn-ghost" style={mini} onClick={onPrint} aria-label={`Print ${name}`}>Print</button>}
    </span>
  );
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="table-wrap"><table className="tc-table">{children}</table></div>;
}

export function PanelEmpty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "0 16px" }}><Empty pad={4}>{children}</Empty></div>;
}

export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export function shortDate(iso: string) {
  if (!iso || iso.length < 10) return iso || "—";
  return new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export const TOTAL: React.CSSProperties = { fontWeight: 800 };
