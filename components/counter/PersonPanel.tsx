"use client";
import Link from "next/link";
import { useSnap } from "@/lib/client";
import { Meter, Tag } from "@/components/portal";
import { printCreditSlip } from "@/components/dialogs";
import { allowanceRouteOf, approvalRemaining, ccOf, initialRemaining, initialSets, openApproval, setsForFte, type CapCheck, type StaffRec } from "@/lib/compute";
import { dayMonth } from "./lib";
import styles from "./counter.module.css";

const Mono = ({ children }: { children: React.ReactNode }) => <span className="tc-mono">{children}</span>;

/* Who is at the counter: details, their route and signed form, and the six-set meters. */
export default function PersonPanel({ st, held, onChange }: { st: StaffRec; held: CapCheck; onChange: () => void }) {
  const { s } = useSnap();
  const cc = ccOf(s, st);
  const cut = st.uniformStyle === "Women's" ? "Women’s cut" : st.uniformStyle === "Men's" ? "Men’s cut" : "";

  const details: React.ReactNode[] = [];
  if (st.group) details.push(st.group);
  if (st.dept) details.push(st.dept);
  if (cc) details.push(<Mono key="cc">{cc}</Mono>);
  if (cut) details.push(cut);
  if (st.top || st.pants) details.push(<span key="usual">usual <Mono>{st.top || "–"}</Mono> / <Mono>{st.pants || "–"}</Mono></span>);

  const route = allowanceRouteOf(s, st);
  const ap = openApproval(s, st.id);
  const apRem = approvalRemaining(s, st.id);
  const signed = ap ? ` · manager signed ${ap.sets} on ${dayMonth(ap.date)}, ${apRem} left` : " · nothing signed";
  let sentence: React.ReactNode;
  if (route === "fte") {
    const n = setsForFte(st.fte);
    sentence = <>FTE table{st.fte ? <> · <Mono>{st.fte}</Mono>{n !== null ? ` proposes ${n} sets` : ""}</> : " · no FTE recorded"}{signed}</>;
  } else if (route === "kit") {
    const sets = initialSets(s, st);
    const left = initialRemaining(s, st) ?? 0;
    sentence = <>Starting kit{sets !== null ? ` · ${sets} sets` : ""}{left > 0 ? ` · ${left} garments still to issue` : ""}{ap ? signed : ""}</>;
  } else {
    sentence = <>Manager approval{signed}</>;
  }

  return (
    <div className={styles.person}>
      <div style={{ minWidth: 0 }}>
        <div className={styles.line1}>
          <span className={styles.name}>{st.first} {st.last}</span>
          <span className={`tc-mono ${styles.meta}`}>{st.num}</span>
          {st.selfEmail && <Tag>Staff app</Tag>}
          {st.inactive && <Tag tone="accent">Inactive</Tag>}
        </div>
        {details.length > 0 && (
          <div className={styles.details}>{details.map((d, i) => <span key={i}>{i > 0 ? " · " : ""}{d}</span>)}</div>
        )}
        <div className={styles.route}>
          <span>{sentence}</span>
          <button type="button" className={`btn btn-ghost ${styles.inlineGhost}`} onClick={() => window.open(`/print/order-form?staff=${encodeURIComponent(st.id)}`, "_blank")}>Order form</button>
          {ap && <button type="button" className={`btn btn-ghost ${styles.inlineGhost}`} onClick={() => printCreditSlip(s, st, ap)}>Credit slip</button>}
        </div>
      </div>
      <div className={styles.meters}>
        <Meter label="Tops" value={held.tops} of={held.cap} />
        <Meter label="Pants" value={held.pants} of={held.cap} />
        {held.other > 0 && <span className={styles.meta}>+{held.other} outside a set</span>}
      </div>
      <div className={styles.personActions}>
        <Link href={`/app/staff/${st.id}`} className="btn btn-ghost">Open record</Link>
        <button type="button" className="btn btn-ghost" onClick={onChange}>Change person</button>
      </div>
    </div>
  );
}
