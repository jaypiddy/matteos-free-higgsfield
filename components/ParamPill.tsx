"use client";

import type { ParamDef } from "@/lib/models";
import Popover from "./Popover";

/**
 * Renders one registry parameter. The control type comes from the model
 * definition, so a new model needs no changes here.
 *
 * Every control is the same rounded chip with a small-caps label over its
 * current value, so the whole control strip scans as one table of settings.
 * Booleans are the exception and show a checkbox rather than a value line —
 * an on/off reads faster as a filled box than as the word "on".
 */
export default function ParamPill({
  def,
  value,
  onChange,
}: {
  def: ParamDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (def.type === "bool") {
    const on = Boolean(value);
    return (
      <button
        type="button"
        onClick={() => onChange(!on)}
        aria-pressed={on}
        className={`press flex items-center gap-2.5 rounded-full border px-4 py-2.5 ${
          on
            ? "border-accent-line bg-accent-soft text-text shadow-[var(--shade-sm)]"
            : "border-edge-soft bg-white/80 text-muted hover:border-accent-line hover:bg-accent-soft"
        }`}
      >
        <span
          className={`grid size-5 shrink-0 place-items-center rounded-full border transition-all duration-200 ${
            on
              ? "brand-gradient border-transparent text-accent-ink"
              : "border-edge bg-white"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            className={`size-3.5 transition-opacity duration-150 ${on ? "opacity-100" : "opacity-0"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
          >
            <path d="m5 12.5 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className={`text-sm font-bold ${on ? "text-text" : "text-muted"}`}>{def.label}</span>
      </button>
    );
  }

  if (def.type === "enum") {
    return (
      <Popover label={def.label} value={String(value ?? def.default ?? "")}>
        {(close) => (
          <div className="max-h-72 overflow-y-auto">
            {def.options?.map((opt) => {
              const selected = String(opt) === String(value ?? def.default);
              return (
                <button
                  key={String(opt)}
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    close();
                  }}
                  className={`flex w-full items-center justify-between rounded-full px-4 py-2.5 text-left text-sm transition-colors duration-150 ${
                    selected
                      ? "bg-accent-soft font-bold text-text"
                      : "text-muted hover:bg-panel-2 hover:text-text"
                  }`}
                >
                  <span>{String(opt)}</span>
                  {selected && <span className="text-accent">✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </Popover>
    );
  }

  if (def.type === "text") {
    const str = typeof value === "string" ? value : "";
    return (
      <Popover label={def.label} value={str ? truncate(str) : "none"}>
        {() => (
          <div className="w-72 p-1.5">
            <textarea
              rows={3}
              value={str}
              placeholder={def.placeholder}
              onChange={(e) => onChange(e.target.value)}
              className="w-full resize-none rounded-xl border border-edge bg-white px-3.5 py-3 text-sm transition-colors duration-200 outline-none placeholder:text-faint focus:border-accent"
            />
          </div>
        )}
      </Popover>
    );
  }

  if (def.type === "seed") {
    const has = value !== undefined && value !== "";
    return (
      <Popover label={def.label} value={has ? String(value) : "auto"}>
        {() => (
          <div className="w-60 space-y-3 p-1.5">
            <p className="text-xs leading-relaxed text-muted">
              Fix the seed to reproduce a result. Leave empty for a new one each time.
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                value={has ? String(value) : ""}
                placeholder="auto"
                onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                className="min-w-0 flex-1 rounded-full border border-edge bg-white px-4 py-2.5 text-sm transition-colors duration-200 outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => onChange(Math.floor(Math.random() * 2_147_483_647))}
                className="press rounded-full border border-edge px-3.5 py-2.5 text-sm text-muted hover:border-accent hover:bg-accent-soft hover:text-accent"
                title="Random seed"
              >
                ⟳
              </button>
            </div>
          </div>
        )}
      </Popover>
    );
  }

  // int / float — a slider, since every numeric param in the registry is bounded.
  const num = Number(value ?? def.default ?? 0);
  const step = def.step ?? (def.type === "int" ? 1 : 0.01);
  const decimals = def.type === "int" ? 0 : String(step).split(".")[1]?.length ?? 2;

  // Durations read better with a unit than as a bare number.
  const unit = def.key === "duration" ? "s" : "";

  return (
    <Popover label={def.label} value={`${num.toFixed(decimals)}${unit}`}>
      {() => (
        <div className="w-60 space-y-3 p-2.5">
          <input
            type="range"
            min={def.min ?? 0}
            max={def.max ?? 1}
            step={step}
            value={num}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <div className="flex items-baseline justify-between text-2xs text-faint">
            <span>{def.min ?? 0}</span>
            <span className="figure text-lg text-text">
              {num.toFixed(decimals)}
              {unit}
            </span>
            <span>{def.max ?? 1}</span>
          </div>
        </div>
      )}
    </Popover>
  );
}

function truncate(s: string): string {
  return s.length > 14 ? `${s.slice(0, 14)}…` : s;
}
