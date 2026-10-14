"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useStageProbabilities } from "@/lib/useStageProbabilities";
import { LEAD_STATUSES, leadStatusLabel, type LeadStatus } from "@/lib/types";

const supabase = createClient();

// Ubah teks input jadi angka 0–100 (kosong/tidak valid → 0).
function toPercent(text: string): number {
  const n = Math.round(Number(text));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

// Bagian "Forecast" di Settings (khusus admin): atur peluang closing (%) per
// status. Angka ini dipakai kartu "Sales forecast" di Dashboard.
export default function ForecastSettings() {
  const { probabilities, reload } = useStageProbabilities();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Isi kotak input dengan angka tersimpan begitu selesai dimuat.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(
      Object.fromEntries(
        LEAD_STATUSES.map((s) => [s, String(probabilities[s] ?? 0)]),
      ),
    );
  }, [probabilities]);

  // Simpan tiap status yang angkanya berubah (satu baris per status).
  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const changed = LEAD_STATUSES.filter(
      (s) => toPercent(draft[s] ?? "0") !== (probabilities[s] ?? 0),
    );
    for (const status of changed) {
      const { error } = await supabase
        .from("stage_probabilities")
        .update({ probability: toPercent(draft[status] ?? "0") })
        .eq("status", status satisfies LeadStatus);
      if (error) {
        setMessage(error.message);
        setSaving(false);
        return;
      }
    }
    await reload();
    setSaving(false);
    setMessage(changed.length > 0 ? "Forecast settings saved." : "No changes.");
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Forecast</h2>
      <p className="text-xs text-[var(--color-muted)]">
        Chance of closing for each stage. The Dashboard forecast multiplies
        each open deal&apos;s estimated value by its stage&apos;s chance.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border border-[var(--color-border)] rounded-lg p-3">
        {LEAD_STATUSES.map((status) => (
          <label key={status} className="flex flex-col gap-1 text-sm">
            {leadStatusLabel(status)}
            <span className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                value={draft[status] ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, [status]: e.target.value })
                }
                className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-20 font-data"
              />
              <span className="text-[var(--color-muted)]">%</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="self-start bg-brand text-on-brand hover:bg-[var(--color-brand-hover)] rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save forecast settings"}
        </button>
        {message && <span className="text-sm text-[var(--color-muted)]">{message}</span>}
      </div>
    </section>
  );
}
