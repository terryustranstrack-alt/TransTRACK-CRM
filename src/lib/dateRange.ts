import { toLocalDateInputValue } from "@/lib/leadFilters";

// Pilihan periode di Dashboard: semua waktu, 7 / 30 hari terakhir, atau
// tanggal pilihan sendiri.
export type DateRangePreset = "all" | "7d" | "30d" | "custom";

// Periode yang sedang dipilih. `from` / `to` berformat "YYYY-MM-DD"
// (sama dengan <input type="date">); string kosong = tidak dibatasi.
export type DateRange = { preset: DateRangePreset; from: string; to: string };

export const ALL_TIME: DateRange = { preset: "all", from: "", to: "" };

// Tanggal hari ini dikurangi beberapa hari, dalam format "YYYY-MM-DD".
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toLocalDateInputValue(d.toISOString());
}

// Hitung tanggal untuk tombol cepat. "Last 7 days" = hari ini + 6 hari
// sebelumnya (total 7 hari), begitu juga 30 hari.
export function presetRange(preset: Exclude<DateRangePreset, "custom">): DateRange {
  if (preset === "all") return ALL_TIME;
  const days = preset === "7d" ? 7 : 30;
  return { preset, from: daysAgo(days - 1), to: daysAgo(0) };
}

// Apakah sebuah timestamp jatuh di dalam periode (dibandingkan per tanggal
// lokal, batas awal & akhir ikut dihitung).
export function inDateRange(iso: string, range: DateRange): boolean {
  if (!range.from && !range.to) return true;
  const day = toLocalDateInputValue(iso);
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}
