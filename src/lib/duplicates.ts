import { normalizePhone } from "@/lib/phone";
import type { Lead } from "@/lib/types";

// Bentuk minimal yang dibutuhkan untuk mengecek "kontak yang sama" — cukup
// nomor telepon & email, jadi bisa dipakai untuk lead utuh maupun sekadar
// calon lead dari form / baris CSV.
export type ContactLike = {
  kontak: string | null;
  email: string | null;
};

// Samakan email untuk perbandingan: huruf kecil + tanpa spasi di ujung.
// String kosong berarti "tidak punya email".
export function normalizeEmail(input: string | null | undefined): string {
  return (input ?? "").trim().toLowerCase();
}

// Dua kontak dianggap SAMA kalau nomor teleponnya sama (setelah formatnya
// disamakan) ATAU email-nya sama — masing-masing hanya kalau kedua sisi
// benar-benar punya nilai itu (dua lead tanpa email bukan berarti duplikat).
export function sameContact(a: ContactLike, b: ContactLike): boolean {
  const phoneA = normalizePhone(a.kontak ?? "");
  const phoneB = normalizePhone(b.kontak ?? "");
  if (phoneA && phoneB && phoneA === phoneB) return true;

  const emailA = normalizeEmail(a.email);
  const emailB = normalizeEmail(b.email);
  if (emailA && emailB && emailA === emailB) return true;

  return false;
}

// Kelompokkan daftar lead jadi grup-grup yang saling "kontak sama". Hanya
// grup berisi 2 lead atau lebih yang dikembalikan. Dipakai untuk tampilan
// "Possible duplicates" di halaman Prospects.
//
// Pakai union-find sederhana supaya rantai duplikat (A≈B lewat telepon,
// B≈C lewat email) tetap masuk satu grup, bukan grup yang tumpang tindih.
export function groupDuplicates(leads: Lead[]): Lead[][] {
  const parent = new Map<string, string>();
  leads.forEach((lead) => parent.set(lead.id, lead.id));

  function find(id: string): string {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Ratakan jalur supaya pencarian berikutnya lebih cepat.
    while (parent.get(id) !== root) {
      const next = parent.get(id)!;
      parent.set(id, root);
      id = next;
    }
    return root;
  }

  for (let i = 0; i < leads.length; i++) {
    for (let j = i + 1; j < leads.length; j++) {
      if (sameContact(leads[i], leads[j])) {
        parent.set(find(leads[i].id), find(leads[j].id));
      }
    }
  }

  const byRoot = new Map<string, Lead[]>();
  for (const lead of leads) {
    const root = find(lead.id);
    const bucket = byRoot.get(root) ?? [];
    bucket.push(lead);
    byRoot.set(root, bucket);
  }

  return [...byRoot.values()]
    .filter((group) => group.length > 1)
    // Grup dengan lead terbanyak dulu, lalu yang terbaru di atas per grup.
    .map((group) =>
      [...group].sort(
        (a, b) =>
          new Date(a.tanggal_masuk).getTime() -
          new Date(b.tanggal_masuk).getTime(),
      ),
    )
    .sort((a, b) => b.length - a.length);
}
