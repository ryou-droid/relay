// Opt-in timing only. Never record parameters, rows, identifiers or error text.
export async function timedQuery<T>(operation: string, work: () => PromiseLike<T>): Promise<T> {
  const start = Date.now();
  let ok = false;
  try { const result = await work(); ok = !(result && typeof result === "object" && "error" in result && result.error); return result; }
  finally {
    if (process.env.RELAY_PERFORMANCE_LOGS === "1") console.info(JSON.stringify({
      event: "relay.performance", operation, elapsed_ms: Date.now() - start, ok,
    }));
  }
}
export function startTiming(operation: string) {
  const start = Date.now();
  return () => {
    if (process.env.RELAY_PERFORMANCE_LOGS === "1") console.info(JSON.stringify({ event: "relay.performance", operation, elapsed_ms: Date.now() - start }));
  };
}
