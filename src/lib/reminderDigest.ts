import { needsFollowUp, nextStepState } from "@/lib/reminders";
import type { LeadStatus } from "@/lib/types";

// Kolom lead yang dibutuhkan untuk pengingat harian.
export type DigestLead = {
  nama: string;
  status: LeadStatus;
  tanggal_update: string;
  next_step_due: string | null;
  assigned_to: string | null;
};

// Ringkasan pengingat untuk satu sales.
export type Digest = {
  total: number;
  overdue: number; // tanggal next step sudah lewat
  dueToday: number; // next step jatuh tempo hari ini
  names: string[]; // beberapa nama lead pertama, untuk isi notifikasi
};

// Kelompokkan lead yang perlu di-follow-up hari ini per sales pemegangnya
// (aturan sama dengan badge "Needs follow-up": next step jatuh tempo/lewat,
// atau sudah lama diam). Lead tanpa pemegang dilewati.
export function buildDigests(leads: DigestLead[]): Map<string, Digest> {
  const digests = new Map<string, Digest>();
  for (const lead of leads) {
    if (!lead.assigned_to) continue;
    if (!needsFollowUp(lead.status, lead.tanggal_update, lead.next_step_due)) continue;

    const digest = digests.get(lead.assigned_to) ?? {
      total: 0,
      overdue: 0,
      dueToday: 0,
      names: [],
    };
    const state = nextStepState(lead.next_step_due);
    digest.total += 1;
    if (state === "overdue") digest.overdue += 1;
    if (state === "today") digest.dueToday += 1;
    if (digest.names.length < 3) digest.names.push(lead.nama);
    digests.set(lead.assigned_to, digest);
  }
  return digests;
}

// Teks notifikasi untuk satu ringkasan, mis.
// "You have 4 leads to follow up today" / "1 overdue · 2 due today · Budi, Andi…".
export function digestMessage(digest: Digest): { title: string; body: string } {
  const parts: string[] = [];
  if (digest.overdue > 0) parts.push(`${digest.overdue} overdue`);
  if (digest.dueToday > 0) parts.push(`${digest.dueToday} due today`);
  const names = digest.names.join(", ") + (digest.total > digest.names.length ? "…" : "");
  parts.push(names);
  return {
    title: `You have ${digest.total} lead${digest.total === 1 ? "" : "s"} to follow up today`,
    body: parts.join(" · "),
  };
}
