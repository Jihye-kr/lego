import type { MetadataRoute } from "next";
import { APP_COLOR } from "@/lib/lines";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LeGo",
    short_name: "LeGo",
    description: "실시간 지하철 도착 정보로 언제 출발할지 알려드려요",
    lang: "ko",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: APP_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
