"use client";

import { BUSINESS_TONE_CLASSES, businessTone } from "@/lib/businessStyle";
import {
  productsForBusiness,
  useLeadFieldSettings,
} from "@/lib/useLeadFieldSettings";

// Pilihan Business berupa tombol berwarna (bukan dropdown) supaya langsung
// kelihatan & gampang disentuh di HP: TransTRACK merah, Academy biru.
// Tombol yang sedang dipilih terisi penuh; sentuh lagi untuk mengosongkan.
//
// Saat business diganti, produk yang khusus milik business lain ikut
// dikosongkan — supaya tidak tersimpan produk Academy di lead TransTRACK
// (atau sebaliknya). Produk umum / ketikan bebas dibiarkan.
export default function BusinessPicker({
  value,
  produk,
  onChange,
  size = "md",
}: {
  value: string;
  produk: string;
  onChange: (patch: { business_unit_id: string; produk: string }) => void;
  size?: "sm" | "md";
}) {
  const { businessUnits, products } = useLeadFieldSettings();
  if (businessUnits.length === 0) return null;

  function select(businessUnitId: string) {
    const stillValid =
      !produk ||
      productsForBusiness(products, businessUnitId).includes(produk) ||
      !products.some((p) => p.name === produk);
    onChange({ business_unit_id: businessUnitId, produk: stillValid ? produk : "" });
  }

  const sizeClass =
    size === "md" ? "px-4 py-2 text-sm" : "px-2 py-1 text-xs";

  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Business">
      {businessUnits.map((b) => {
        const selected = b.id === value;
        const tone = BUSINESS_TONE_CLASSES[businessTone(b.name)];
        return (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => select(selected ? "" : b.id)}
            className={`rounded-lg border-2 font-semibold transition-colors ${sizeClass} ${
              selected ? `${tone.solid} shadow-sm` : tone.outline
            }`}
          >
            {selected ? "✓ " : ""}
            {b.name}
          </button>
        );
      })}
    </div>
  );
}
