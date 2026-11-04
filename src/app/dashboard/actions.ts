"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchAdSpends, metaAdsConfigured, type AdSpend } from "@/lib/metaAds";

export type AdSpendResult =
  | { configured: false }
  | { configured: true; spends: Record<string, AdSpend> };

// Dipanggil kartu "Ad performance" di Dashboard: biaya iklan per ID iklan
// Meta untuk rentang tanggal yang sedang dipilih. Hanya untuk user yang
// sudah login (token Meta tetap di server, tidak pernah dikirim ke browser).
export async function getAdSpends(
  adIds: string[],
  since: string,
  until: string,
): Promise<AdSpendResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !metaAdsConfigured()) return { configured: false };

  // Jaga-jaga: ID iklan Meta selalu berupa angka, tanggal "YYYY-MM-DD".
  // Input lain ditolak supaya tidak bisa dipakai memanggil alamat Meta lain.
  const validIds = [...new Set(adIds)].filter((id) => /^\d+$/.test(id)).slice(0, 100);
  const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (validIds.length === 0 || !isDate(since) || !isDate(until)) {
    return { configured: true, spends: {} };
  }
  return { configured: true, spends: await fetchAdSpends(validIds, since, until) };
}
