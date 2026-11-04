"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// Peta id iklan (ad_sources.id) → judul iklan Meta. Dipakai untuk label
// "From ad: …" di kartu Board dan halaman lead, supaya sales tahu iklan /
// penawaran apa yang diklik pelanggan sebelum membalas.
export function useAdHeadlines(): Map<string, string> {
  const [headlines, setHeadlines] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("ad_sources").select("id, headline");
      if (data) {
        setHeadlines(
          new Map(data.map((a) => [a.id as string, (a.headline as string) ?? ""])),
        );
      }
    }
    load();
  }, []);

  return headlines;
}
