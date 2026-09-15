/* Community edition: there are no plans, so sign-up asks nothing about them. */
export type SignupPlan = "hosted_small" | "hosted_facility";
export default function PlanChoice(_: { value: SignupPlan; onChange: (v: SignupPlan) => void }) { return null; }
