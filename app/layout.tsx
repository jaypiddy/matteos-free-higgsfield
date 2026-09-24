import type { Metadata } from "next";
import { Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/TopNav";
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
      className={`${playfair.variable} ${jakarta.variable} h-full antialiased`}
    >
      {/* The gradient wash lives on <body> and is fixed, so it stays put while
          each page scrolls its own column over the top of it. Nothing here
          paints an opaque background over it — that is the cards' job. */}
      <body className="min-h-full text-text">
        <div className="flex h-dvh flex-col overflow-hidden">
          <TopNav />
          <main className="relative min-h-0 flex-1 overflow-hidden">{children}</main>
        </div>
      </body>
    </html>
  );
}
