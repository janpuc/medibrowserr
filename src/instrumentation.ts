/** Next.js instrumentation hook — runs once when the server boots. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/server/monitors/scheduler");
    startScheduler();
  }
}
