import type { LeadStatus } from "@/lib/types";

// Pilihan alasan saat lead ditandai Lost ("Hilang"). Daftar tetap (bukan
// teks bebas) supaya bisa dihitung di laporan — "berapa lead kalah karena
// harga?". Detail tambahan bisa ditulis di catatan (close_note).
export const LOST_REASONS = [
  "Price",
  "Competitor",
  "No budget",
  "No response",
  "Not a fit",
  "Timing",
  "Other",
] as const;

// Pilihan alasan saat lead ditandai Won ("Closing") — opsional.
export const WON_REASONS = [
  "Price",
  "Product fit",
  "Fast response",
  "Referral / trust",
  "Demo / trial",
  "Other",
] as const;

// Status "hasil akhir" (Won / Lost) — saat lead pindah ke sini, CRM minta
// alasan dan mencatat tanggal closing-nya.
export function isFinalStatus(status: LeadStatus): boolean {
  return status === "Closing" || status === "Hilang";
}

// Daftar alasan yang cocok untuk status tujuan.
export function reasonsFor(status: LeadStatus): readonly string[] {
  return status === "Hilang" ? LOST_REASONS : WON_REASONS;
}

// Alasan wajib diisi hanya untuk Lost — kalau tidak, laporan "kenapa kalah"
// jadi bolong. Untuk Won boleh dikosongkan.
export function reasonRequired(status: LeadStatus): boolean {
  return status === "Hilang";
}

// Alasan + catatan yang dipilih user di dialog.
export type CloseDetails = { reason: string; note: string };
