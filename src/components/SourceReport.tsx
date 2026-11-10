"use client";

import { useMemo } from "react";
import { buildSourceReport } from "@/lib/sourceReport";
import type { Lead } from "@/lib/types";

function formatRupiah(n: number) {
  return n.toLocaleString("id-ID", { style: "currency", currency: "IDR" });
}

// Kartu "Source performance" di Dashboard: per sumber lead (Instagram Ads,
// Referral, dll.) — berapa lead masuk, berapa jadi Won/Lost, nilai yang
// dihasilkan, lama rata-rata sampai closing, dan alasan kalah tersering.
// `leads` sudah dipersempit ke periode yang dipilih di atas Dashboard.
export default function SourceReport({ leads }: { leads: Lead[] }) {
  const rows = useMemo(() => buildSourceReport(leads), [leads]);

  return (
    <div className="card p-5">
      <div className="mb-4">
        <h2 className="card-title">Source performance</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Which lead sources turn into deals
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">
          No leads in this period.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-border)]">
                <th className="py-2 pr-3 font-medium">Source</th>
                <th className="py-2 pr-3 font-medium text-right">Leads</th>
                <th className="py-2 pr-3 font-medium text-right">Won</th>
                <th className="py-2 pr-3 font-medium text-right">Lost</th>
                <th className="py-2 pr-3 font-medium text-right">Conversion</th>
                <th className="py-2 pr-3 font-medium text-right">Won value</th>
                <th className="py-2 pr-3 font-medium text-right">Days to close</th>
                <th className="py-2 font-medium">Top lost reason</th>
              </tr>
            </thead>
            <tbody className="font-data">
              {rows.map((row) => (
                <tr key={row.source} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="py-2 pr-3 font-sans">{row.source}</td>
                  <td className="py-2 pr-3 text-right">{row.leads}</td>
                  <td className="py-2 pr-3 text-right text-[var(--color-success)]">{row.won}</td>
                  <td className="py-2 pr-3 text-right text-[var(--color-danger)]">{row.lost}</td>
                  <td className="py-2 pr-3 text-right">{row.conversionRate.toFixed(1)}%</td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{formatRupiah(row.wonValue)}</td>
                  <td className="py-2 pr-3 text-right">
                    {row.avgDaysToClose != null ? row.avgDaysToClose.toFixed(0) : "-"}
                  </td>
                  <td className="py-2 font-sans text-[var(--color-muted)]">
                    {row.topLostReason ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
