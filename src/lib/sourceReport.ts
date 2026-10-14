import type { Lead } from "@/lib/types";

const SATU_HARI_MS = 24 * 60 * 60 * 1000;
const TANPA_SUMBER = "(No source)";

// Satu baris laporan "Source performance": angka-angka untuk satu sumber lead.
export type SourceRow = {
  source: string;
  leads: number;
  won: number;
  lost: number;
  conversionRate: number; // persen won dari total lead sumber ini
  wonValue: number; // total estimasi nilai lead yang Won
  avgDaysToClose: number | null; // rata-rata hari dari masuk sampai Won
  topLostReason: string | null; // alasan kalah paling sering
};

// Alasan yang paling sering muncul di daftar (null kalau kosong).
function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

// Rata-rata jumlah hari dari lead masuk sampai ditandai Won. Hanya lead yang
// punya tanggal closing (closed_at, mulai dicatat sejak 0021) yang dihitung.
function averageDaysToClose(wonLeads: Lead[]): number | null {
  const durations = wonLeads
    .filter((l) => l.closed_at)
    .map(
      (l) =>
        (new Date(l.closed_at!).getTime() - new Date(l.tanggal_masuk).getTime()) /
        SATU_HARI_MS,
    );
  if (durations.length === 0) return null;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

// Hitung satu baris laporan dari semua lead yang berasal dari satu sumber.
function buildRow(source: string, leads: Lead[]): SourceRow {
  const wonLeads = leads.filter((l) => l.status === "Closing");
  const lostLeads = leads.filter((l) => l.status === "Hilang");
  return {
    source,
    leads: leads.length,
    won: wonLeads.length,
    lost: lostLeads.length,
    conversionRate: leads.length > 0 ? (wonLeads.length / leads.length) * 100 : 0,
    wonValue: wonLeads.reduce((sum, l) => sum + (l.estimasi_nilai ?? 0), 0),
    avgDaysToClose: averageDaysToClose(wonLeads),
    topLostReason: mostCommon(
      lostLeads.map((l) => l.close_reason).filter((r): r is string => !!r),
    ),
  };
}

// Kelompokkan lead per sumber lalu hitung laporannya. Urutan: sumber dengan
// nilai Won terbesar dulu, lalu yang lead-nya paling banyak — supaya sumber
// yang paling menghasilkan uang ada di atas.
export function buildSourceReport(leads: Lead[]): SourceRow[] {
  const groups = new Map<string, Lead[]>();
  for (const lead of leads) {
    const source = lead.sumber?.trim() || TANPA_SUMBER;
    groups.set(source, [...(groups.get(source) ?? []), lead]);
  }
  return [...groups]
    .map(([source, groupLeads]) => buildRow(source, groupLeads))
    .sort((a, b) => b.wonValue - a.wonValue || b.leads - a.leads);
}
