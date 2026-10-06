export const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash && url.pathname !== "/" &&
      /^(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)$/.test(url.hostname);
  } catch { return false; }
}
export type DeviceSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export function validSubscription(value: unknown): value is DeviceSubscription {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<DeviceSubscription>;
  return validEndpoint(s.endpoint) && typeof s.keys?.p256dh === "string" && /^[A-Za-z0-9_-]{87}$/.test(s.keys.p256dh) &&
    typeof s.keys?.auth === "string" && /^[A-Za-z0-9_-]{22}$/.test(s.keys.auth);
}
