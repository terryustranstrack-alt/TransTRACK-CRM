"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_PROBABILITIES, type StageProbabilities } from "@/lib/forecast";
import type { LeadStatus } from "@/lib/types";

const supabase = createClient();

// Peluang closing per status dari tabel stage_probabilities (diatur admin di
// Settings > Forecast). Selama belum termuat / kalau gagal, pakai angka awal.
// `reload()` untuk memuat ulang setelah admin menyimpan perubahan.
export function useStageProbabilities() {
  const [probabilities, setProbabilities] =
    useState<StageProbabilities>(DEFAULT_PROBABILITIES);

  async function reload() {
    const { data } = await supabase
      .from("stage_probabilities")
      .select("status, probability");
    if (!data || data.length === 0) return;
    setProbabilities(
      Object.fromEntries(
        data.map((row) => [row.status as LeadStatus, row.probability as number]),
      ),
    );
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, []);

  return { probabilities, reload };
}
