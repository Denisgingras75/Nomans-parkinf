import type { Metadata, Viewport } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import NavTabs from "@/components/NavTabs";

export const metadata: Metadata = {
  title: "NoMans Combi — Oak Bluffs Shuttle",
  description: "Ping the NoMans combi shuttle for a ride to or from NoMans Restaurant, Oak Bluffs.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NoMans Combi",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Mirrors --bg from globals.css. Must be a literal hex — the browser
  // parses <meta name="theme-color"> before any stylesheet resolves, so
  // var(--bg) won't work here. Keep in sync if --bg changes.
  themeColor: "#0a1525",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavTabs />
        {children}
      </body>
    </html>
  );
}
