import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Relay",
    short_name: "Relay",
    description: "チームの引き継ぎ・確認・対応管理",
    lang: "ja",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f5f7fb",
    theme_color: "#2563eb",
    icons: [
      { src: "/icons/relay-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/relay-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/relay-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
