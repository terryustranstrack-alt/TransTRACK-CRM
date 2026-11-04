import type { AdSource, Lead } from "@/lib/types";

// Satu baris laporan "Ad performance": angka-angka untuk satu iklan Meta.
export type AdReportRow = {
  ad: AdSource;
  chats: number; // chat WhatsApp yang masuk dari iklan ini
  leads: number; // lead yang tercatat berasal dari iklan ini
  chatToLeadRate: number; // persen chat yang jadi lead
  won: number;
  lost: number;
  conversionRate: number; // persen lead yang Won
  wonValue: number; // total estimasi nilai lead Won
  openValue: number; // total estimasi nilai lead yang masih berjalan
  // Biaya iklan dari Meta (null = belum terhubung / tidak bisa diambil)
  spend: number | null;
  costPerChat: number | null;
  costPerLead: number | null;
  costPerWon: number | null; // biaya iklan per deal Won
  roas: number | null; // nilai Won ÷ biaya iklan (mis. 4.2 = tiap Rp1 iklan jadi Rp4,2)
};

const percent = (part: number, whole: number) =>
  whole > 0 ? (part / whole) * 100 : 0;

// Biaya per satuan (per chat / per lead). null kalau biaya tidak diketahui
// atau belum ada chat/lead sama sekali (tidak bisa dibagi nol).
const costPer = (spend: number | null, count: number) =>
  spend != null && count > 0 ? spend / count : null;

// ROAS = nilai deal Won dibagi biaya iklan. null kalau biaya belum
// diketahui atau nol (tidak bisa dibagi).
const roasOf = (wonValue: number, spend: number | null) =>
  spend != null && spend > 0 ? wonValue / spend : null;

// Hitung satu baris dari chat & lead milik satu iklan.
function buildRow(
  ad: AdSource,
  chats: number,
  leads: Lead[],
  spend: number | null,
): AdReportRow {
  const won = leads.filter((l) => l.status === "Closing");
  const lost = leads.filter((l) => l.status === "Hilang");
  const open = leads.filter((l) => l.status !== "Closing" && l.status !== "Hilang");
  const sumValue = (list: Lead[]) =>
    list.reduce((sum, l) => sum + (l.estimasi_nilai ?? 0), 0);
  return {
    ad,
    chats,
    leads: leads.length,
    chatToLeadRate: percent(leads.length, chats),
    won: won.length,
    lost: lost.length,
    conversionRate: percent(won.length, leads.length),
    wonValue: sumValue(won),
    openValue: sumValue(open),
    spend,
    costPerChat: costPer(spend, chats),
    costPerLead: costPer(spend, leads.length),
    costPerWon: costPer(spend, won.length),
    roas: roasOf(sumValue(won), spend),
  };
}

// Kelompokkan chat & lead per iklan lalu hitung laporannya. `chatAdIds` =
// ad_source_id dari tiap chat (satu elemen per chat). Iklan tanpa chat
// maupun lead di periode ini tidak ditampilkan. Urutan: nilai Won terbesar
// dulu, lalu jumlah lead, lalu jumlah chat. `spendBySourceId` = biaya per
// ID iklan Meta (kosong kalau belum terhubung ke Meta).
export function buildAdReport(
  ads: AdSource[],
  leads: Lead[],
  chatAdIds: string[],
  spendBySourceId: Record<string, number> = {},
): AdReportRow[] {
  const chatCount = new Map<string, number>();
  for (const id of chatAdIds) chatCount.set(id, (chatCount.get(id) ?? 0) + 1);

  const leadsByAd = new Map<string, Lead[]>();
  for (const lead of leads) {
    if (!lead.ad_source_id) continue;
    leadsByAd.set(lead.ad_source_id, [
      ...(leadsByAd.get(lead.ad_source_id) ?? []),
      lead,
    ]);
  }

  return ads
    .map((ad) =>
      buildRow(
        ad,
        chatCount.get(ad.id) ?? 0,
        leadsByAd.get(ad.id) ?? [],
        spendBySourceId[ad.source_id] ?? null,
      ),
    )
    .filter((row) => row.chats > 0 || row.leads > 0)
    .sort(
      (a, b) => b.wonValue - a.wonValue || b.leads - a.leads || b.chats - a.chats,
    );
}

// Baris total semua iklan (untuk baris paling bawah tabel).
export function totalAdReport(rows: AdReportRow[]) {
  const sum = (pick: (r: AdReportRow) => number) =>
    rows.reduce((s, r) => s + pick(r), 0);
  const chats = sum((r) => r.chats);
  const leads = sum((r) => r.leads);
  const won = sum((r) => r.won);
  // Total biaya hanya dihitung kalau minimal satu iklan punya data biaya.
  const hasSpend = rows.some((r) => r.spend != null);
  const spend = hasSpend ? sum((r) => r.spend ?? 0) : null;
  const wonValue = sum((r) => r.wonValue);
  return {
    costPerWon: costPer(spend, won),
    roas: roasOf(wonValue, spend),
    spend,
    costPerChat: costPer(spend, chats),
    costPerLead: costPer(spend, leads),
    chats,
    leads,
    chatToLeadRate: percent(leads, chats),
    won,
    lost: sum((r) => r.lost),
    conversionRate: percent(won, leads),
    wonValue,
    openValue: sum((r) => r.openValue),
  };
}
