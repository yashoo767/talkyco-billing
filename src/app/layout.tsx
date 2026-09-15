import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e1b4b",
};

export const metadata: Metadata = {
  title: "Talkyco Billing — Messaging Usage & Billing",
  description:
    "Check your messaging usage and billing instantly. Enter a phone number to view activity and costs for any period.",
  keywords: [
    "talkyco billing",
    "messaging usage",
    "sms billing",
    "message cost lookup",
    "usage check",
  ],
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://billing.talkyco.com"
  ),
  openGraph: {
    type:        "website",
    siteName:    "Talkyco Billing",
    title:       "Talkyco Billing — Messaging Usage & Billing",
    description: "Instantly check messaging usage and billing for any phone number.",
    url:         "/",
  },
  twitter: {
    card:        "summary",
    title:       "Talkyco Billing — Messaging Usage & Billing",
    description: "Instantly check messaging usage and billing for any phone number.",
  },
  robots: {
    index:  true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/png"     href="/favicon.png" sizes="32x32" />
      </head>
      <body>{children}</body>
    </html>
  );
}
