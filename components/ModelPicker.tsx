"use client";

import { useMemo, useState } from "react";
import { ComposedModal, ContainedList, ContainedListItem, ModalBody, ModalHeader, Tag } from "@carbon/react";
import { ChevronDown } from "@carbon/icons-react";
import { familiesByKind, modelsInFamily, type ModelDef } from "@/lib/models";
import { formatUsd } from "@/lib/shared";

/**
 * The model is the most consequential choice in the composer, so it gets its
 * own trigger and a dialog rather than one more dropdown.
 *
 * Two levels: pick a family, then a variant. With ~70 models a flat list is
 * unusable, and families map onto how people actually choose ("I want Kling"
 * long before "I want Kling 3.0 Pro"). Families sit on the left and their
 * variants on the right, so switching family doesn't lose your place.
 */
export default function ModelPicker({
  current,
  onPick,
  unavailable,
  kind,
}: {
  current: ModelDef;
  onPick: (id: string) => void;
  unavailable: Record<string, string>;
  kind: "image" | "video";
}) {
  const [open, setOpen] = useState(false);
  const families = useMemo(() => familiesByKind(kind), [kind]);
  const currentFamily = current.family ?? current.vendor;
  const [family, setFamily] = useState(currentFamily);

  function price(m: ModelDef) {
    if (unavailable[m.id]) return "unavailable";
    if (m.metered) return "metered";
    return m.fromUsd ? `from ${formatUsd(m.fromUsd)}` : "—";
  }

  function show() {
    setFamily(currentFamily);
    setOpen(true);
  }

  return (
    <>
      <button type="button" className="model-trigger" onClick={show} aria-haspopup="dialog">
        <span className="model-trigger__text">
          <span className="model-trigger__family">{currentFamily}</span>
          <span className="model-trigger__name">{current.name}</span>
        </span>
        <ChevronDown size={16} className="model-trigger__icon" aria-hidden="true" />
      </button>

      <ComposedModal
        open={open}
        size="md"
        onClose={() => {
          setOpen(false);
          return true;
        }}
        className="model-picker"
      >
        <ModalHeader label={`${families.length} ${kind} families`} title="Choose a model" />
        <ModalBody className="model-picker__body">
          <ContainedList label="Family" kind="on-page" className="model-picker__families">
            {families.map((f) => {
              const inFamily = modelsInFamily(kind, f);
              const cheapest = inFamily.reduce(
                (a, b) => ((b.fromUsd || Infinity) < (a.fromUsd || Infinity) ? b : a),
                inFamily[0],
              );
              return (
                <ContainedListItem
                  key={f}
                  onClick={() => setFamily(f)}
                  className={f === family ? "is-selected" : undefined}
                  aria-current={f === family ? "true" : undefined}
                >
                  <span className="model-picker__row">
                    <span className="model-picker__row-title">{f}</span>
                    <span className="model-picker__row-sub">
                      {inFamily.length} {inFamily.length === 1 ? "option" : "options"}
                      {cheapest?.fromUsd ? ` · from ${formatUsd(cheapest.fromUsd)}` : ""}
                    </span>
                  </span>
                </ContainedListItem>
              );
            })}
          </ContainedList>

          <ContainedList label={family} kind="on-page" className="model-picker__variants">
            {modelsInFamily(kind, family).map((m) => (
              <ContainedListItem
                key={m.id}
                onClick={() => {
                  onPick(m.id);
                  setOpen(false);
                }}
                className={m.id === current.id ? "is-selected" : undefined}
                aria-current={m.id === current.id ? "true" : undefined}
              >
                <span className="model-picker__row">
                  <span className="model-picker__variant-head">
                    <span className={`model-picker__row-title${unavailable[m.id] ? " is-unavailable" : ""}`}>
                      {m.name}
                    </span>
                    <Tag size="sm" type={unavailable[m.id] ? "red" : m.metered ? "purple" : "gray"}>
                      {price(m)}
                    </Tag>
                  </span>
                  <span className="model-picker__row-sub">{unavailable[m.id] ?? m.blurb}</span>
                </span>
              </ContainedListItem>
            ))}
          </ContainedList>
        </ModalBody>
      </ComposedModal>
    </>
  );
}
