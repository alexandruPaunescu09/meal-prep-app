import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Meal Prep Portal",
    short_name: "Meal Prep",
    description: "Your meal plan, today's meals, and reviews — all in one place.",
    start_url: "/portal",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    // Keep in sync with viewport.themeColor in app/layout.tsx.
    theme_color: "#059669",
    // Android share sheet -> recipe import (GET, so the params land in the URL). Customers who share
    // here are sent to a friendly portal page by proxy.ts.
    share_target: {
      action: "/recipes/import",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
