"use client";

import { useMemo } from "react";
import { buildForecast } from "@/lib/forecast";
import { useStageProbabilities } from "@/lib/useStageProbabilities";
import { useProfiles, profileLabel } from "@/lib/useProfiles";
import { LEAD_STATUSES, leadStatusLabel, type Lead } from "@/lib/types";

function formatRupiah(n: number) {
  return n.toLocaleString("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });
}

// Kartu "Sales forecast" di Dashboard: perkiraan nilai yang realistis akan
// closing dari lead yang masih berjalan (nilai lead × peluang statusnya),
// total + per sales. Sales biasa hanya melihat lead miliknya (aturan akses
// database), jadi angkanya otomatis cuma miliknya sendiri.
export default function ForecastCard({ leads }: { leads: Lead[] }) {
  const { probabilities } = useStageProbabilities();
  const profiles = useProfiles();
  const forecast = useMemo(
    () => buildForecast(leads, probabilities),
    [leads, probabilities],
  );

  // Label per baris: nama sales, atau "Unassigned" untuk lead tanpa pemegang.
  function rowLabel(assignedTo: string | null): string {
    const profile = profiles.find((p) => p.id === assignedTo);
    return profile ? profileLabel(profile) : "Unassigned";
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
      <h2 className="font-medium mb-1">Sales forecast</h2>
      <p className="text-xs text-[var(--color-muted)] mb-3">
        Open deals weighted by stage:{" "}
        {LEAD_STATUSES.filter((s) => s !== "Closing" && s !== "Hilang")
          .map((s) => `${leadStatusLabel(s)} ${probabilities[s] ?? 0}%`)
          .join(" · ")}
      </p>
      <p className="font-data text-2xl font-semibold text-brand mb-4">
        {formatRupiah(forecast.total)}
      </p>
      {forecast.rows.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">No open deals.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {forecast.rows.map((row) => (
            <li
              key={row.assignedTo ?? "unassigned"}
              className="flex justify-between gap-3 text-sm"
            >
              <span className="truncate">
                {rowLabel(row.assignedTo)}{" "}
                <span className="text-[var(--color-muted)]">
                  · {row.openLeads} open
                </span>
              </span>
              <span className="font-data shrink-0">{formatRupiah(row.weighted)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
