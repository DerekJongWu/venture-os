// Next.js instrumentation hook — runs once when the server process starts.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
//
// We start the cron scheduler here so it is registered exactly once,
// regardless of how many times App Router modules are hot-reloaded.

export async function register() {
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCron } = await import("@/lib/cron");
    startCron();
  }
}
