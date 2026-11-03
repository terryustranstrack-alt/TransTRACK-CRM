"use client";

import { BUSINESS_TONE_CLASSES, businessTone } from "@/lib/businessStyle";
import {
  BUSINESS_FILTER_ALL,
  BUSINESS_FILTER_NONE,
} from "@/lib/leadFilters";
import type { BusinessUnit } from "@/lib/types";

const NEUTRAL_SELECTED = "bg-brand text-on-brand border-[var(--color-brand)]";
const NEUTRAL_IDLE =
  "bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border)] hover:bg-[var(--color-muted-bg)]";

// Filter Business berupa deretan tombol berwarna (dipakai di Board dan
// Prospects): "All", tiap business (TransTRACK merah, Academy biru), dan
// "No business" untuk lead yang business-nya belum diisi. Nilai filter:
// BUSINESS_FILTER_ALL, BUSINESS_FILTER_NONE, atau id business.
export default function BusinessFilter({
  value,
  onChange,
  businessUnits,
}: {
  value: string;
  onChange: (value: string) => void;
  businessUnits: BusinessUnit[];
}) {
  if (businessUnits.length === 0) return null;

  const chip = (key: string, label: string, selected: boolean, cls: string) => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onChange(key)}
      className={`rounded-lg border-2 px-3 py-1.5 text-sm font-semibold transition-colors ${cls}`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="radiogroup"
      aria-label="Filter by business"
    >
      {chip(
        BUSINESS_FILTER_ALL,
        "All businesses",
        value === BUSINESS_FILTER_ALL,
        value === BUSINESS_FILTER_ALL ? NEUTRAL_SELECTED : NEUTRAL_IDLE,
      )}
      {businessUnits.map((b) => {
        const tone = BUSINESS_TONE_CLASSES[businessTone(b.name)];
        const selected = value === b.id;
        return chip(b.id, b.name, selected, selected ? `${tone.solid} shadow-sm` : tone.outline);
      })}
      {chip(
        BUSINESS_FILTER_NONE,
        "No business",
        value === BUSINESS_FILTER_NONE,
        value === BUSINESS_FILTER_NONE
          ? NEUTRAL_SELECTED
          : `${NEUTRAL_IDLE} border-dashed`,
      )}
    </div>
  );
}
