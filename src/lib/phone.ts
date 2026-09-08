/**
 * Menyamakan format nomor telepon Indonesia supaya bisa dicocokkan antara
 * leads.kontak (bebas format, mis. "0812-3456-789" atau "+62 812 3456 789")
 * dan wa_id dari WhatsApp Cloud API (digit saja dengan kode negara, mis.
 * "6281234567890"). Hasilnya: digit saja, diawali kode negara "62".
 */
export function normalizePhone(input: string): string {
  // Buang semua yang bukan angka (spasi, tanda "+", strip, tanda kurung).
  let digits = input.replace(/\D/g, "");
  if (!digits) return "";

  // "08xxx" (format lokal) → "628xxx".
  if (digits.startsWith("0")) {
    digits = "62" + digits.slice(1);
  }
  // "620xxx" (mis. orang menulis "+62 0812…") → buang "0" setelah kode negara.
  if (digits.startsWith("620")) {
    digits = "62" + digits.slice(3);
  }
  // "8xxx" tanpa kode negara & tanpa "0" → tambahkan "62" di depan.
  if (digits.startsWith("8")) {
    digits = "62" + digits;
  }
  return digits;
}
