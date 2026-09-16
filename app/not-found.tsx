import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ maxWidth: 520, margin: "80px auto", padding: "0 20px", fontFamily: "var(--font-body)" }}>
      <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700, color: "var(--color-neutral-600)" }}>ThreadCount</div>
      <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 34, letterSpacing: "-0.02em", margin: "10px 0 0" }}>There is nothing at this address.</h1>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--color-neutral-800)", marginTop: 14 }}>The linen room signs in at <Link href="/auth" style={{ fontWeight: 700 }}>/auth</Link>, the phone counter at <Link href="/m" style={{ fontWeight: 700 }}>/m</Link>, and staff at <Link href="/my" style={{ fontWeight: 700 }}>/my</Link>.</p>
    </main>
  );
}
