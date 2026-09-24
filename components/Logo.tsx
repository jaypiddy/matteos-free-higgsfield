/**
 * Matteos Free Higgsfield mark.
 *
 * An M cut as a single open stroke — two stems and a shallow valley, drawn on
 * a 24 grid with round joins so it stays even-weighted at 16px. A filled
 * monogram was tried first and closed up at small sizes; an open stroke keeps
 * its counters at every size the app uses it.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19V6.5l8 7.5 8-7.5V19" />
    </svg>
  );
}

/** Mark in its indigo disc, as it appears in the nav and on the home page. */
export function LogoTile({ className = "size-8" }: { className?: string }) {
  return (
    <span
      className={`brand-gradient sheen grid shrink-0 place-items-center rounded-full text-accent-ink shadow-[var(--shade-accent)] ${className}`}
    >
      <Logo className="size-[56%]" />
    </span>
  );
}
