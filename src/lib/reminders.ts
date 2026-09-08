import type { LeadStatus } from "@/lib/types";

// Berapa hari maksimal sebuah lead boleh "diam" (tidak di-update) di tiap
// status sebelum dianggap perlu di-follow-up. Dipakai sebagai CADANGAN saja —
// hanya kalau lead belum punya tanggal "next step" yang eksplisit. Status yang
// tidak ada di daftar ini (Closing, Hilang) tidak pernah butuh follow-up.
const THRESHOLD_HARI: Partial<Record<LeadStatus, number>> = {
  Baru: 2,
  Dihubungi: 2,
  Tertarik: 4,
  Nego: 4,
};

// Status "hasil akhir" — lead sudah selesai, tidak pernah butuh follow-up.
function isClosedStatus(status: LeadStatus): boolean {
  return status === "Closing" || status === "Hilang";
}

export function daysSinceUpdate(tanggalUpdate: string): number {
  const diffMs = Date.now() - new Date(tanggalUpdate).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// Tanggal hari ini menurut waktu lokal browser, format "YYYY-MM-DD" — supaya
// bisa dibandingkan langsung (string) dengan nilai kolom next_step_due.
function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type NextStepState = "none" | "upcoming" | "today" | "overdue";

// Keadaan tanggal "next step" sebuah lead: belum diisi, masih akan datang,
// jatuh tempo hari ini, atau sudah lewat. Dipakai untuk penanda warna di
// kartu board / tabel prospek.
export function nextStepState(nextStepDue: string | null): NextStepState {
  if (!nextStepDue) return "none";
  const today = todayLocalDate();
  // next_step_due dari Supabase berupa "YYYY-MM-DD" (tipe date), jadi 10
  // karakter pertama sudah cukup untuk perbandingan tanggal.
  const due = nextStepDue.slice(0, 10);
  if (due < today) return "overdue";
  if (due === today) return "today";
  return "upcoming";
}

// True kalau lead ini perlu di-follow-up sekarang. Aturan gabungan:
//  - lead yang sudah Closing/Hilang: tidak pernah.
//  - kalau ada tanggal "next step": perlu follow-up begitu tanggal itu lewat
//    atau jatuh tempo hari ini.
//  - kalau TIDAK ada tanggal "next step": pakai aturan lama — sudah berapa
//    lama lead diam di status sekarang (THRESHOLD_HARI).
// Dipakai untuk badge/filter "Needs follow-up" di LeadBoard & ProspekTable.
export function needsFollowUp(
  status: LeadStatus,
  tanggalUpdate: string,
  nextStepDue: string | null = null,
): boolean {
  if (isClosedStatus(status)) return false;

  if (nextStepDue) {
    const state = nextStepState(nextStepDue);
    return state === "overdue" || state === "today";
  }

  const threshold = THRESHOLD_HARI[status];
  if (threshold == null) return false;
  return daysSinceUpdate(tanggalUpdate) >= threshold;
}
