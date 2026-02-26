// ─── Background cron jobs ─────────────────────────────────────────────────────
//
// Started once via src/instrumentation.ts when the Next.js server boots.
// Uses node-cron — never throws, logs errors to SyncLog instead.
//
// Schedule: Daily at 08:00 local time
//   - Pull all tracked deals from Attio

import cron from "node-cron";
import { pull } from "@/lib/sync/attio";

let started = false;

export function startCron() {
  if (started) return; // Guard against double-registration in dev (HMR)
  started = true;

  // Daily at 08:00 — pull all locally tracked deals from Attio
  cron.schedule("0 8 * * *", async () => {
    console.log("[cron] Daily Attio pull starting…");
    try {
      const result = await pull();
      console.log(
        `[cron] Daily Attio pull complete — synced: ${result.synced}, errors: ${result.errors.length}`
      );
      if (result.errors.length > 0) {
        console.error("[cron] Pull errors:", result.errors);
      }
    } catch (err) {
      // Never crash the process — errors already written to SyncLog by pull()
      console.error("[cron] Daily Attio pull threw unexpectedly:", err);
    }
  });

  console.log("[cron] Scheduled: daily Attio pull at 08:00");
}
