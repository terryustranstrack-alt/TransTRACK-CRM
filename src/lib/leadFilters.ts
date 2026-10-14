import type { Lead } from "@/lib/types";

// Tanggal mana yang dipakai filter tanggal di halaman Prospects:
// tanggal lead masuk, atau tanggal terakhir diubah.
export type LeadDateField = "tanggal_masuk" | "tanggal_update";

// Ubah timestamp ISO jadi format "YYYY-MM-DD" versi waktu lokal browser,
// supaya bisa dicocokkan dengan nilai <input type="date"> (filter tanggal).
// Tidak pakai iso.slice(0, 10) karena itu tanggal UTC, bisa beda hari
// dengan tanggal lokal pengguna.
export function toLocalDateInputValue(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Samakan teks sebelum dibandingkan: huruf kecil semua dan spasi berlebih
// dibuang, supaya "  Instagram   ADS" tetap cocok dengan "instagram ads".
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

// Ambil angkanya saja dari nomor telepon, lalu awalan "62" diganti "0",
// supaya "+62 812-3456" dan "0812 3456" dianggap nomor yang sama.
function normalizePhone(text: string): string {
  const digits = text.replace(/\D/g, "");
  return digits.startsWith("62") ? "0" + digits.slice(2) : digits;
}

// Gabungkan semua kolom yang bisa dicari dari satu lead jadi satu teks.
// `extraText` untuk teks yang tidak tersimpan di lead itu sendiri, mis.
// nama sales penanggung jawab dan label status.
function searchableText(lead: Lead, extraText: string[]): string {
  return normalizeText(
    [
      lead.nama,
      lead.kontak,
      lead.email,
      lead.sumber,
      lead.perusahaan,
      lead.jabatan,
      lead.kota,
      lead.produk,
      lead.catatan,
      lead.next_step,
      ...extraText,
    ]
      .filter(Boolean)
      .join(" | "),
  );
}

// Cek apakah lead cocok dengan kata kunci pencarian. Kata kunci dipecah per
// kata, dan SEMUA kata harus ditemukan (di kolom mana saja) — jadi
// "referral jakarta" hanya menampilkan lead dari Referral yang di Jakarta.
// Kata yang berisi angka juga dicocokkan ke nomor telepon tanpa peduli
// spasi/strip/awalan +62.
export function matchesKeyword(
  lead: Lead,
  keyword: string,
  extraText: string[] = [],
): boolean {
  const words = normalizeText(keyword).split(" ").filter(Boolean);
  if (words.length === 0) return true;

  const text = searchableText(lead, extraText);
  const phone = normalizePhone(lead.kontak);

  return words.every((word) => {
    if (text.includes(word)) return true;
    const wordDigits = normalizePhone(word);
    return wordDigits.length >= 3 && phone.includes(wordDigits);
  });
}

// Cek apakah sumber lead sama persis dengan sumber yang dipilih di dropdown
// (huruf besar/kecil dan spasi diabaikan). "all" berarti tidak difilter.
export function matchesSource(lead: Lead, source: string): boolean {
  if (source === "all") return true;
  return normalizeText(lead.sumber ?? "") === normalizeText(source);
}

// Cek apakah tanggal lead (masuk / terakhir diubah) ada di rentang
// "dari"–"sampai" (keduanya ikut dihitung). Kosong = tidak ada batas.
export function matchesDateRange(
  lead: Lead,
  field: LeadDateField,
  from: string,
  to: string,
): boolean {
  if (!from && !to) return true;
  const date = toLocalDateInputValue(lead[field]);
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}
