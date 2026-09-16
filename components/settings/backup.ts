"use client";
/* Export backup, shared by Data & audit log and the delete-my-account flow. Fetched rather than
 * linked so the page can say how many photos the file left out, and so a lapsed session lands on
 * sign-in instead of saving an error page as a backup. */
import { useState } from "react";
import { useRouter } from "next/navigation";

export function useBackupExport(say: (k: string, v: string) => void) {
  const router = useRouter();
  const [bkBusy, setBkBusy] = useState(false);
  async function exportBackup() {
    setBkBusy(true); say("backup", "Preparing the backup…");
    try {
      const res = await fetch("/api/backup");
      if (res.status === 401) { window.location.assign(`/auth?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
      if (!res.ok) { say("backup", ((await res.json().catch(() => ({}))) as { error?: string }).error || "Export failed — nothing was downloaded."); return; }
      const text = await res.text();
      const omitted = Number(/"photosOmitted":\s*(\d+)/.exec(text)?.[1] || 0);
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1] || "threadcount-backup.json";
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      say("backup", omitted
        ? `${name} downloaded. ${omitted} older photo${omitted === 1 ? " was" : "s were"} left out so the file stays small enough to restore; the images stay on the server.`
        : `${name} downloaded.`);
      router.refresh();
    } catch (e) { say("backup", "Export failed — " + (e as Error).message); }
    finally { setBkBusy(false); }
  }
  return { bkBusy, exportBackup };
}
