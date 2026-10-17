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
