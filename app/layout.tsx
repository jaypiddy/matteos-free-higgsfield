import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
// After globals.css so Carbon's reset and tokens win wherever the two overlap.
// globals.css and the two fonts below go once the remaining pages are on Carbon.
import "./carbon.scss";
import AppHeader from "@/components/AppHeader";
import { BRAND } from "@/lib/brand";

/**
 * Two faces, and only two.
 *
 * Playfair Display carries every heading and every headline figure; Plus
 * Jakarta Sans carries everything else — body, labels, controls. Both are
 * variable, so the full weight range costs one file each. Monospace is left
 * to the system stack rather than pulling a third webfont for the handful of
 * places it appears.
 */
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

/** Carbon's typefaces. carbon.scss points Carbon's sans and mono families at
 *  these variables; 300/400/600 are the only weights its type scale uses. */
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  weight: ["300", "400", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "600"],
  subsets: ["latin"],
  display: "swap",
});

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
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} ${playfair.variable} ${jakarta.variable} h-full`}
    >
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
