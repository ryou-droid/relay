import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegistration } from "@/components/pwa-registration";
export const metadata: Metadata = {
  title: "Relay | 引き継ぎ・確認・対応管理",
  description: "チームの引き継ぎを、確かな対応へ。",
  appleWebApp: { capable: true, title: "Relay", statusBarStyle: "default" },
  applicationName: "Relay",
  // Next.js 16 emits mobile-web-app-capable; retain Apple's tag for older iOS.
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/icons/relay.svg", type: "image/svg+xml" },
    ],
    apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2563eb",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}<PwaRegistration /></body>
    </html>
  );
}
