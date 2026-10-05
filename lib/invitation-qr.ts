import qrcode from "qrcode-generator";
import { recoveryCallbackUrl } from "./recovery-origin.mjs";
export function invitationUrl(code: string, kind: "user" | "admin") {
  const url = new URL("/register", recoveryCallbackUrl());
  url.searchParams.set("invite", code);
  url.searchParams.set("type", kind);
  return url.toString();
}
export function invitationQr(url: string) {
  const qr = qrcode(0, "M");
  qr.addData(url, "Byte");
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 24, scalable: true });
}
