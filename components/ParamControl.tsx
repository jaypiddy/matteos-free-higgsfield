"use client";

import { Dropdown, IconButton, NumberInput, Slider, TextInput, Toggle } from "@carbon/react";
import { Renew } from "@carbon/icons-react";
import type { ParamDef } from "@/lib/models";

/**
 * Renders one registry parameter as a Carbon control. The control type comes
 * from the model definition, so a new model needs no changes here.
 *
 * All controls use the small size and a visible label, so the settings row
 * reads as one strip of labelled fields above the prompt.
 */
export default function ParamControl({
  def,
  value,
  onChange,
}: {
  def: ParamDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `param-${def.key}`;

  if (def.type === "bool") {
    return (
      <div className="param param--toggle">
        <Toggle
          id={id}
          size="sm"
          labelText={def.label}
          labelA="Off"
          labelB="On"
          toggled={Boolean(value)}
          onToggle={(on) => onChange(on)}
        />
      </div>
    );
  }

  if (def.type === "enum") {
    const options = def.options ?? [];
    const current = value ?? def.default ?? options[0];
    return (
      <div className="param param--enum">
        <Dropdown
          id={id}
          size="sm"
          titleText={def.label}
          label={def.label}
          items={options}
          itemToString={(o) => (o === null || o === undefined ? "" : String(o))}
          // Compare as strings: the registry mixes numeric and string enums.
          selectedItem={options.find((o) => String(o) === String(current)) ?? null}
          onChange={({ selectedItem }) => onChange(selectedItem)}
        />
      </div>
    );
  }

  if (def.type === "text") {
    return (
      <div className="param param--text">
        <TextInput
          id={id}
          size="sm"
          labelText={def.label}
          placeholder={def.placeholder ?? "None"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  if (def.type === "seed") {
    const has = value !== undefined && value !== "";
    return (
      <div className="param param--seed">
        <NumberInput
          id={id}
          size="sm"
          label={def.label}
          hideSteppers
          allowEmpty
          placeholder="Auto"
          helperText={undefined}
          value={has ? Number(value) : ""}
          onChange={(_e, { value: v }) => onChange(v === "" || v === undefined ? undefined : Number(v))}
        />
        <IconButton
          kind="ghost"
          size="sm"
          label="Random seed"
          align="top"
          onClick={() => onChange(Math.floor(Math.random() * 2_147_483_647))}
        >
          <Renew />
        </IconButton>
      </div>
    );
  }

  // int / float — a slider, since every numeric param in the registry is bounded.
  const min = def.min ?? 0;
  const max = def.max ?? 1;
  const step = def.step ?? (def.type === "int" ? 1 : 0.01);
  const num = Number(value ?? def.default ?? min);
  // Durations read better with a unit than as a bare number.
  const unit = def.key === "duration" ? "s" : "";

  return (
    <div className="param param--slider">
      <Slider
        id={id}
        labelText={def.label}
        min={min}
        max={max}
        step={step}
        value={num}
        formatLabel={(v) => `${v}${unit}`}
        onChange={({ value: v }) => onChange(Number(v))}
      />
    </div>
  );
}
