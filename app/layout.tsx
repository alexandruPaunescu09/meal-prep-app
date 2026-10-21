import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { UiProviders } from "@/components/ui/providers";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Meal Prep",
  description: "Meal prep business management app",
  appleWebApp: {
    capable: true,
    title: "Meal Prep",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  // Keep in sync with theme_color in app/manifest.ts.
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  // Required for env(safe-area-inset-*) to be non-zero in the installed app.
  viewportFit: "cover",
  // The app is light-only: opts out of Android/Samsung forced dark.
  colorScheme: "only light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="h-full font-[family-name:var(--font-geist)]">
        <UiProviders>{children}</UiProviders>
      </body>
    </html>
  );
}
