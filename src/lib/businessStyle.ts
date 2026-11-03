// Warna penanda Business supaya mudah dibedakan sekilas di seluruh CRM:
// TransTRACK = merah, TransTRACK Academy = biru, business lain = abu-abu.
// Ditentukan dari NAMA business (bukan id) karena daftar business diatur
// admin di Settings — cukup ada kata "academy" di namanya untuk jadi biru.

export type BusinessTone = "transtrack" | "academy" | "other";

export function businessTone(name: string | null | undefined): BusinessTone {
  const n = (name ?? "").toLowerCase();
  if (n.includes("academy")) return "academy";
  if (n.includes("transtrack")) return "transtrack";
  return "other";
}

// Kelas Tailwind per warna:
//  - solid: label/tombol yang terisi penuh (paling mencolok)
//  - outline: tombol pilihan yang belum dipilih
//  - stripe: garis tebal di sisi kiri kartu lead (Board)
export const BUSINESS_TONE_CLASSES: Record<
  BusinessTone,
  { solid: string; outline: string; stripe: string }
> = {
  transtrack: {
    solid: "bg-red-600 text-white border-red-600",
    outline: "bg-red-50 text-red-700 border-red-300 hover:bg-red-100",
    stripe: "border-l-4 border-l-red-600",
  },
  academy: {
    solid: "bg-blue-600 text-white border-blue-600",
    outline: "bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100",
    stripe: "border-l-4 border-l-blue-600",
  },
  other: {
    solid: "bg-slate-600 text-white border-slate-600",
    outline: "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100",
    stripe: "border-l-4 border-l-slate-500",
  },
};
