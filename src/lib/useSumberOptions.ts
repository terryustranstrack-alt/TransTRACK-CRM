"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Daftar cadangan — cuma dipakai kalau tabel lead_sources masih kosong
// (mis. migration 0025 belum dijalankan), supaya dropdown tidak kosong.
const DEFAULT_SUMBER = [
  "Instagram Ads",
  "Facebook Ads",
  "Referral",
  "Organic",
  "Website",
  "WhatsApp",
];

const supabase = createClient();

// Daftar pilihan "Source" (asal lead) untuk dropdown SumberSelect. Sekarang
// diatur admin di Settings > Lead fields (tabel lead_sources). Sumber lama
// yang tidak ada di daftar tetap tampil di lead-nya lewat opsi "Other" di
// SumberSelect.
export function useSumberOptions() {
  const [options, setOptions] = useState<string[]>(DEFAULT_SUMBER);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("lead_sources")
        .select("name")
        .order("name");
      if (data && data.length > 0) setOptions(data.map((row) => row.name));
    }
    load();
  }, []);

  return options;
}
