"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Small anchored popover used by every control in the prompt bar.
 *
 * The default trigger is a rounded chip: label in small caps above, value
 * below, so a row of them reads as a spec sheet rather than a row of tags.
 * Pass `trigger` to draw something else — the model picker uses that to get a
 * wider two-line card while keeping this open/close behaviour.
 */
export default function Popover({
  label,
  value,
  children,
  align = "start",
  trigger,
}: {
  label: ReactNode;
  value?: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  trigger?: (open: boolean) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {trigger ? (
        <button type="button" onClick={() => setOpen((o) => !o)} className="block text-left">
          {trigger(open)}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`press flex h-full min-w-0 items-center gap-2.5 rounded-full border px-4 py-2.5 text-left ${
            open
              ? "border-accent-line bg-accent-soft text-text shadow-[var(--shade-sm)]"
              : "border-edge-soft bg-white/80 text-muted hover:border-accent-line hover:bg-accent-soft"
          }`}
        >
          <span className="min-w-0">
            {label !== "" && label !== undefined && (
              <span className="overline block text-faint">{label}</span>
            )}
            {value !== undefined && (
              <span className="mt-0.5 block truncate text-sm font-bold text-text">{value}</span>
            )}
          </span>
          <svg
            viewBox="0 0 24 24"
            className={`size-3.5 shrink-0 text-faint transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {open && (
        <div
          className={`pop absolute bottom-[calc(100%+10px)] z-50 min-w-[210px] rounded-2xl border border-edge-soft bg-white/95 p-2 shadow-[var(--shade-lg)] backdrop-blur-xl ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
