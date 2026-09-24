"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { LogoTile } from "./Logo";

/**
 * Top navigation bar.
 *
 * A translucent band across the app, blurred so the gradient wash reads
 * through it: wordmark hard left, the three destinations as pills beside it,
 * and the two generate surfaces pulled out to the right — those are the two
 * things people come here to do, so they are not buried in the same row as
 * Settings.
 *
 * The active destination gets a pale indigo pill; the active studio tab gets
 * the solid gradient. Only one thing on screen is ever fully saturated.
 *
 * Labels drop away as the window narrows, in order of how well the icon
 * stands in for them, so the right-hand pair is never pushed off screen.
 */

const NAV = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/library", label: "Library", icon: LibraryIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

const STUDIO = [
  { href: "/image", label: "Image", icon: ImageIcon },
  { href: "/video", label: "Video", icon: VideoIcon },
] as const;

export default function TopNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="glass relative z-50 flex h-20 shrink-0 items-center gap-1.5 border-b border-edge-soft px-3 sm:px-5 xl:gap-2 xl:px-7">
      <Link href="/" className="press flex min-w-0 items-center gap-3 pr-2 lg:pr-6 xl:pr-8">
        <LogoTile className="size-10" />
        <span className="hidden min-w-0 lg:block">
          <span className="display block truncate text-sm leading-none font-bold">
            {BRAND.name}
          </span>
          <span className="overline mt-1.5 block truncate leading-none text-faint">
            Higgsfield API
          </span>
        </span>
      </Link>

      <nav className="flex items-center gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-current={active ? "page" : undefined}
              className={`press flex shrink-0 items-center gap-2.5 rounded-full px-3 py-2.5 text-sm xl:px-4 ${
                active
                  ? "bg-accent-soft font-bold text-accent"
                  : "font-medium text-muted hover:bg-white/70 hover:text-text"
              }`}
            >
              <Icon className={`size-5 shrink-0 ${active ? "text-accent" : "text-faint"}`} />
              <span className="hidden xl:block">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2 pl-1.5">
        {STUDIO.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              title={`Generate ${label.toLowerCase()}`}
              aria-current={active ? "page" : undefined}
              className={`press flex shrink-0 items-center gap-2.5 rounded-full px-3 py-2.5 text-sm font-bold sm:px-4 xl:px-5 ${
                active
                  ? "brand-gradient sheen text-accent-ink shadow-[var(--shade-accent)] hover:shadow-[var(--shade-accent-hover)]"
                  : "border border-edge bg-white/70 text-muted hover:border-accent-line hover:bg-accent-soft hover:text-accent"
              }`}
            >
              <Icon className="size-5 shrink-0" />
              <span className="hidden sm:block">{label}</span>
            </Link>
          );
        })}
      </div>
    </header>
  );
}

type IconProps = { className?: string };

function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" strokeLinejoin="round" />
    </svg>
  );
}

function ImageIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="4" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m4 17 4.5-4.5 3.5 3.5 3-2.5L20 17" strokeLinejoin="round" />
    </svg>
  );
}

function VideoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="13" height="14" rx="4" />
      <path d="m16 10.5 5-3v9l-5-3z" strokeLinejoin="round" />
    </svg>
  );
}

function LibraryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7.5" height="7.5" rx="2.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.5" />
    </svg>
  );
}

function SettingsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5M18.7 5.3l-1.7 1.7M7 17l-1.7 1.7M18.7 18.7 17 17M7 7 5.3 5.3" strokeLinecap="round" />
    </svg>
  );
}
