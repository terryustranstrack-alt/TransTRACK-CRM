import "server-only";

// Ambil biaya iklan (spend) dari Meta Marketing API, per iklan, supaya
// laporan "Ad performance" bisa menghitung biaya per chat / per lead.
// Butuh token akses dengan izin `ads_read` untuk akun iklan TransTRACK
// dan Academy — disimpan di env META_ADS_ACCESS_TOKEN (lihat README).

const GRAPH_API_VERSION = "v21.0";

export type AdSpend = { spend: number; currency: string };

// Token sudah diisi? Kalau belum, fitur biaya iklan disembunyikan.
export function metaAdsConfigured(): boolean {
  return !!process.env.META_ADS_ACCESS_TOKEN;
}

// Biaya satu iklan di rentang tanggal (format "YYYY-MM-DD", termasuk kedua
// ujungnya). Return null kalau Meta menolak (mis. token tidak punya akses
// ke akun iklan itu) — iklan itu tampil tanpa biaya, laporan tetap jalan.
async function fetchOneAdSpend(
  adId: string,
  since: string,
  until: string,
): Promise<AdSpend | null> {
  const params = new URLSearchParams({
    fields: "spend,account_currency",
    time_range: JSON.stringify({ since, until }),
    access_token: process.env.META_ADS_ACCESS_TOKEN ?? "",
  });
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(adId)}/insights?${params}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: { spend?: string; account_currency?: string }[];
  };
  // Tidak ada baris = iklan tidak tayang di periode itu → biaya 0.
  const row = json.data?.[0];
  return { spend: Number(row?.spend ?? 0), currency: row?.account_currency ?? "IDR" };
}

// Biaya banyak iklan sekaligus (diambil paralel). Hasil: peta ID iklan
// Meta → biaya. Iklan yang gagal diambil tidak ada di peta.
export async function fetchAdSpends(
  adIds: string[],
  since: string,
  until: string,
): Promise<Record<string, AdSpend>> {
  const results = await Promise.all(
    adIds.map(async (id) => [id, await fetchOneAdSpend(id, since, until)] as const),
  );
  const spends: Record<string, AdSpend> = {};
  for (const [id, spend] of results) if (spend) spends[id] = spend;
  return spends;
}
