import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://cinematicarchiveshq.github.io/dcu-completionist-watchlist/"),
  title: "Hall of Justice Archives",
  description: "A cinematic, local-first DC screen completion tracker featuring release and chronological watch orders, episode-level progress, profiles, ratings, watched dates, analytics, achievements, and more.",
  alternates: {
    canonical: "./",
  },
  openGraph: {
    type: "website",
    url: "./",
    title: "Hall of Justice Archives",
    description: "Track the complete DC screen archive in release or chronological order.",
    siteName: "Hall of Justice Archives",
  },
  appleWebApp: {
    capable: true,
    title: "Hall of Justice Archives",
    statusBarStyle: "black-translucent",
  },
  other: {
    "codex-preview": "development",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Relative URLs keep install assets inside the GitHub Pages project path. */}
        <link rel="manifest" href="./manifest.webmanifest" />
        <link rel="icon" href="./hall-of-justice-icon.svg?v=1" type="image/svg+xml" />
        <link rel="shortcut icon" href="./hall-of-justice-icon.svg?v=1" />
        <link rel="apple-touch-icon" href="./hall-of-justice-icon.svg?v=1"  />
        <meta name="msapplication-TileColor" content="#05080d" />
        <meta name="msapplication-TileImage" content="./hall-of-justice-icon.svg?v=1" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
