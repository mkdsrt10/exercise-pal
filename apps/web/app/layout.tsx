import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Exercise Pal",
  description: "Your training buddy. Point the camera, talk, train.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f1412",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
        <nav className="tabs">
          <Link href="/">Train</Link>
          <Link href="/history">History</Link>
          <Link href="/me">Me</Link>
        </nav>
      </body>
    </html>
  );
}
