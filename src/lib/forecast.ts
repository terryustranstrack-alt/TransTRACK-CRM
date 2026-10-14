import type { Lead, LeadStatus } from "@/lib/types";

// Peluang closing (0–100) per status — dari tabel stage_probabilities.
export type StageProbabilities = Partial<Record<LeadStatus, number>>;

// Angka cadangan kalau tabel belum bisa dibaca (mis. migrasi 0023 belum
// dijalankan). Sama dengan angka awal di migrasi.
export const DEFAULT_PROBABILITIES: Record<LeadStatus, number> = {
  Baru: 10,
  Dihubungi: 20,
  Tertarik: 40,
  Nego: 70,
  Closing: 100,
  Hilang: 0,
};

// Lead yang masih berjalan (belum Won/Lost) — hanya ini yang di-forecast;
// yang sudah Won dihitung sebagai "Won value", bukan perkiraan.
function isOpen(lead: Lead): boolean {
  return lead.status !== "Closing" && lead.status !== "Hilang";
}

// Nilai "berbobot" satu lead: estimasi nilai × peluang statusnya.
// Contoh: Rp 100 juta di status Negotiating (70%) → Rp 70 juta.
function weightedValue(lead: Lead, probabilities: StageProbabilities): number {
  const percent = probabilities[lead.status] ?? DEFAULT_PROBABILITIES[lead.status];
  return ((lead.estimasi_nilai ?? 0) * percent) / 100;
}

export type ForecastRow = { assignedTo: string | null; weighted: number; openLeads: number };

// Forecast pipeline: total nilai berbobot dari semua lead yang masih
// berjalan, plus rinciannya per sales (assigned_to; null = belum ada yang
// pegang). Urut dari forecast terbesar.
export function buildForecast(
  leads: Lead[],
  probabilities: StageProbabilities,
): { total: number; rows: ForecastRow[] } {
  const perAssignee = new Map<string | null, ForecastRow>();
  let total = 0;

  for (const lead of leads.filter(isOpen)) {
    const value = weightedValue(lead, probabilities);
    total += value;
    const row = perAssignee.get(lead.assigned_to) ?? {
      assignedTo: lead.assigned_to,
      weighted: 0,
      openLeads: 0,
    };
    row.weighted += value;
    row.openLeads += 1;
    perAssignee.set(lead.assigned_to, row);
  }

  return {
    total,
    rows: [...perAssignee.values()].sort((a, b) => b.weighted - a.weighted),
  };
}
