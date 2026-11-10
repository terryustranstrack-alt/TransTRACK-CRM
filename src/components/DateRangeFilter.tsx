"use client";

import { presetRange, type DateRange, type DateRangePreset } from "@/lib/dateRange";

const SELECTED = "bg-brand text-on-brand border-[var(--color-brand)]";
const IDLE =
  "bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border)] hover:bg-[var(--color-muted-bg)]";

const OPTIONS: { preset: DateRangePreset; label: string }[] = [
  { preset: "all", label: "All time" },
  { preset: "7d", label: "Last 7 days" },
  { preset: "30d", label: "Last 30 days" },
  { preset: "custom", label: "Custom" },
];

// Pemilih periode di atas Dashboard: tombol cepat (semua waktu, 7 / 30 hari
// terakhir) atau "Custom" yang memunculkan dua kotak tanggal From–to.
export default function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  // Pindah ke "Custom": tanggal yang sedang tampil dipakai sebagai isian
  // awal, jadi tinggal digeser (mis. dari "Last 30 days").
  function choose(preset: DateRangePreset) {
    if (preset === "custom") onChange({ ...value, preset: "custom" });
    else onChange(presetRange(preset));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Date range">
        {OPTIONS.map((o) => (
          <button
            key={o.preset}
            type="button"
            role="radio"
            aria-checked={value.preset === o.preset}
            onClick={() => choose(o.preset)}
            className={`rounded-lg border-2 px-3 py-1.5 text-sm font-semibold transition-colors ${
              value.preset === o.preset ? SELECTED : IDLE
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {value.preset === "custom" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="date"
            value={value.from}
            max={value.to || undefined}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            aria-label="From date"
            className="field"
          />
          <span className="text-[var(--color-muted)]">to</span>
          <input
            type="date"
            value={value.to}
            min={value.from || undefined}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            aria-label="To date"
            className="field"
          />
        </div>
      )}
    </div>
  );
}
