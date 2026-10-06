import { validEndpoint } from "./protocol";
type Job = { job_id: string; lease: string; endpoint: string; p256dh: string; auth_key: string; post_id: string };
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
export async function drainPushQueue({ rpc, send, key, post, now = Date.now }: {
  rpc: Rpc; send: (job: Job, payload: string) => Promise<unknown>; key: string; post?: string; now?: () => number;
}) {
  const started = now();
  const counts = { sent: 0, retry: 0, skipped: 0 };
  for (let batch = 0; batch < 20 && now() - started < 20000; batch++) {
    const claimed = await rpc("claim_push_jobs", { p_key: key, p_post: post || null, p_limit: 4 });
    if (claimed.error) throw new Error("queue_claim_failed");
    const jobs = (claimed.data || []) as Job[];
    if (!jobs.length) break;
    await Promise.all(jobs.map(async job => {
      let result: "sent" | "retry" | "expired" | "skipped" = "retry";
      try {
        const permission = await rpc("authorize_push_job", { p_id: job.job_id, p_lease: job.lease, p_key: key });
        if (permission.error) throw new Error("queue_authorize_failed");
        if (!permission.data || !validEndpoint(job.endpoint)) result = "skipped";
        else {
          // No names, titles, content, organization identifiers or device information.
          await send(job, JSON.stringify({ kind: "new_post", event_id: job.job_id, post_id: job.post_id }));
          result = "sent";
        }
      } catch (error) {
        const status = error && typeof error === "object" && "statusCode" in error ? error.statusCode : null;
        result = status === 404 || status === 410 ? "expired" : "retry";
      }
      const acknowledged = await rpc("finish_push_job", { p_id: job.job_id, p_lease: job.lease, p_result: result });
      if (acknowledged.error) throw new Error("queue_ack_failed");
      counts[result === "expired" ? "skipped" : result]++;
    }));
  }
  return counts;
}
