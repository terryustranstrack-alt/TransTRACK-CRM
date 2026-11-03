"use client";

import { useState } from "react";

// Value dummy khusus untuk opsi "Lainnya (tulis sendiri)..." di dropdown.
// Sengaja dibuat aneh/unik supaya tidak mungkin bentrok dengan nilai sumber
// asli yang diketik user sendiri.
const LAINNYA = "__lainnya__";

// Dropdown pilih dari daftar, dengan opsi tambahan untuk mengetik nilai
// baru yang belum ada di daftar. Awalnya khusus "Source", sekarang dipakai
// juga untuk "Product" (lewat emptyLabel/customPlaceholder).
export default function SumberSelect({
  value,
  onChange,
  options,
  id,
  emptyLabel = "- Select source -",
  customPlaceholder = "Type a new source",
  className = "border border-[var(--color-border)] rounded-lg px-3 py-2",
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  id?: string;
  emptyLabel?: string;
  customPlaceholder?: string;
  className?: string;
}) {
  // Kotak ketik sendiri tampil kalau user memilih "Other", ATAU kalau nilai
  // yang tersimpan tidak ada di daftar (mis. nilai lama / hasil chatbot) —
  // supaya nilai itu tidak hilang dari tampilan. Dihitung ulang tiap render
  // karena daftar pilihan datang belakangan dari database.
  const [choseOther, setChoseOther] = useState(false);
  const showCustomInput =
    choseOther || (value !== "" && !options.includes(value));

  function handleSelectChange(selected: string) {
    if (selected === LAINNYA) {
      setChoseOther(true);
      onChange("");
    } else {
      setChoseOther(false);
      onChange(selected);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        id={id}
        value={showCustomInput ? LAINNYA : value}
        onChange={(e) => handleSelectChange(e.target.value)}
        className={className}
      >
        <option value="">{emptyLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={LAINNYA}>Other (type your own)...</option>
      </select>
      {showCustomInput && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={customPlaceholder}
          className={className}
          autoFocus={choseOther}
        />
      )}
    </div>
  );
}
