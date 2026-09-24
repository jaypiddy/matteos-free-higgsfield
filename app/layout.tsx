import type { Metadata } from "next";
import "./globals.css";
// After globals.css so Carbon's reset and tokens win wherever the two overlap.
import "./carbon.scss";
import AppHeader from "@/components/AppHeader";
import { BRAND } from "@/lib/brand";

/**
 * Typeface: BD Terminal VF from an Adobe Fonts kit, used for everything.
 * carbon.scss points Carbon's sans and mono families at "bd-terminal-vf"; it is
 * variable across 100–800, which covers the 300/400/600 Carbon's scale uses.
 *
 * Adobe serves the kit, so it needs a network connection and the kit's web
 * project must allow this domain (localhost / 127.0.0.1). Offline, text falls
 * back to the system stack.
 */
const ADOBE_FONTS_KIT = "https://use.typekit.net/qku4vqa.css";

export const metadata: Metadata = {
  title: BRAND.name,
  description: `${BRAND.name} — ${BRAND.tagline}`,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://use.typekit.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://p.typekit.net" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href={ADOBE_FONTS_KIT} />
      </head>
      <body>
        <AppHeader />
        <div className="app-shell">
          <main id="main-content" className="app-main">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
