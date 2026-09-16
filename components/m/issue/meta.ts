/* The meta line under a person's name on the counter phone: group · number · dept · CC. */
import { ccOf, type Snapshot, type StaffRec } from "@/lib/compute";

export function personMeta(s: Snapshot, st: StaffRec): string {
  const cc = ccOf(s, st);
  return [st.group, st.num, st.dept, cc && `CC ${cc}`].map((x) => (x || "").trim()).filter(Boolean).join(" · ");
}

export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
