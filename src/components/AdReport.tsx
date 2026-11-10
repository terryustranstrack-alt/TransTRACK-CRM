"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildAdReport, totalAdReport } from "@/lib/adReport";
import {
  BUSINESS_FILTER_ALL,
  BUSINESS_FILTER_NONE,
  toLocalDateInputValue,
} from "@/lib/leadFilters";
import { inDateRange, type DateRange } from "@/lib/dateRange";
import { useLeadFieldSettings } from "@/lib/useLeadFieldSettings";
import BusinessBadge from "@/components/BusinessBadge";
import BusinessFilter from "@/components/BusinessFilter";
import { getAdSpends, type AdSpendResult } from "@/app/dashboard/actions";
import type { AdSource, Lead } from "@/lib/types";

const supabase = createClient();

type ChatRow = { ad_source_id: string; created_at: string; brand_id: string | null };

function formatRupiah(n: number) {
  return n.toLocaleString("id-ID", { style: "currency", currency: "IDR" });
}

// Biaya per chat / per lead — "—" kalau tidak diketahui.
function formatCost(n: number | null) {
  return n == null ? "—" : formatRupiah(Math.round(n));
}

// ROAS ditulis "4.2×"; "—" kalau belum bisa dihitung.
function formatRoas(n: number | null) {
  return n == null ? "—" : `${n.toFixed(1)}×`;
}

// Rentang tanggal untuk menanyakan biaya ke Meta. Kalau "From" kosong,
// mulai dari hari iklan paling awal terlihat; kalau "To" kosong, sampai
// hari ini — supaya sama dengan "semua waktu" di tabel.
function spendDateRange(ads: AdSource[], from: string, to: string) {
  const earliest = ads
    .map((ad) => toLocalDateInputValue(ad.first_seen_at))
    .sort()[0];
  const today = toLocalDateInputValue(new Date().toISOString());
  return { since: from || earliest || today, until: to || today };
}

// Kartu "Ad performance" di Dashboard: per iklan Meta (Click-to-WhatsApp) —
// berapa chat yang masuk, berapa jadi lead, berapa Won/Lost, dan nilai
// yang dihasilkan. Bisa difilter per Business di kartu ini.
// `leads`, `brandFilter` & `dateRange` datang dari Dashboard — `leads` sudah
// dipersempit per brand dan ke periode yang dipilih di atas halaman.
export default function AdReport({
  leads,
  brandFilter,
  dateRange,
}: {
  leads: Lead[];
  brandFilter: string;
  dateRange: DateRange;
}) {
  const { businessUnits } = useLeadFieldSettings();
  const [ads, setAds] = useState<AdSource[]>([]);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [businessFilter, setBusinessFilter] = useState(BUSINESS_FILTER_ALL);
  const dateFrom = dateRange.from;
  const dateTo = dateRange.to;

  useEffect(() => {
    async function load() {
      const [adsResult, chatsResult] = await Promise.all([
        supabase.from("ad_sources").select("*"),
        supabase
          .from("conversations")
          .select("ad_source_id, created_at, brand_id")
          .not("ad_source_id", "is", null),
      ]);
      setAds((adsResult.data ?? []) as AdSource[]);
      setChats((chatsResult.data ?? []) as ChatRow[]);
    }
    load();
  }, []);

  // Biaya iklan dari Meta untuk rentang tanggal yang dipilih. Diambil ulang
  // setiap tanggal berubah. Kalau Meta belum dihubungkan (token belum
  // diisi), kolom biaya tidak ditampilkan.
  const [spendResult, setSpendResult] = useState<AdSpendResult | null>(null);
  useEffect(() => {
    if (ads.length === 0) return;
    const { since, until } = spendDateRange(ads, dateFrom, dateTo);
    let cancelled = false;
    getAdSpends(ads.map((ad) => ad.source_id), since, until)
      .then((result) => {
        if (!cancelled) setSpendResult(result);
      })
      .catch(() => {
        if (!cancelled) setSpendResult({ configured: false });
      });
    return () => {
      cancelled = true;
    };
  }, [ads, dateFrom, dateTo]);

  const showSpend = spendResult?.configured === true;
  const spendBySourceId = useMemo(
    () =>
      spendResult?.configured
        ? Object.fromEntries(
            Object.entries(spendResult.spends).map(([id, s]) => [id, s.spend]),
          )
        : {},
    [spendResult],
  );

  const rows = useMemo(() => {
    const adsInBusiness = ads.filter((ad) =>
      businessFilter === BUSINESS_FILTER_ALL
        ? true
        : businessFilter === BUSINESS_FILTER_NONE
          ? !ad.business_unit_id
          : ad.business_unit_id === businessFilter,
    );
    const chatAdIds = chats
      .filter((c) => brandFilter === "all" || c.brand_id === brandFilter)
      .filter((c) => inDateRange(c.created_at, dateRange))
      .map((c) => c.ad_source_id);
    return buildAdReport(adsInBusiness, leads, chatAdIds, spendBySourceId);
  }, [ads, chats, leads, businessFilter, brandFilter, dateRange, spendBySourceId]);

  const total = totalAdReport(rows);
  const nameOf = (id: string | null) => businessUnits.find((b) => b.id === id)?.name;

  return (
    <div className="card p-5">
      <div className="mb-3">
        <h2 className="card-title">Ad performance</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Meta Click-to-WhatsApp ads — chats, leads and deals per ad
          {showSpend ? ", with ad spend from Meta" : ""}
        </p>
      </div>

      <div className="mb-4">
        <BusinessFilter
          value={businessFilter}
          onChange={setBusinessFilter}
          businessUnits={businessUnits}
        />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">
          No chats from ads in this period. Ads appear here once customers
          message you from a Click-to-WhatsApp ad.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-border)]">
                <th className="py-2 pr-3 font-medium">Ad</th>
                {showSpend && (
                  <th className="py-2 pr-3 font-medium text-right" title="Amount spent on this ad in Meta for the selected period">
                    Spend
                  </th>
                )}
                <th className="py-2 pr-3 font-medium text-right">Chats</th>
                {showSpend && (
                  <th className="py-2 pr-3 font-medium text-right">Cost / chat</th>
                )}
                <th className="py-2 pr-3 font-medium text-right">Leads</th>
                {showSpend && (
                  <th className="py-2 pr-3 font-medium text-right" title="Cost per lead">
                    Cost / lead
                  </th>
                )}
                <th className="py-2 pr-3 font-medium text-right" title="Share of chats that became a lead">
                  Chat → lead
                </th>
                <th className="py-2 pr-3 font-medium text-right">Won</th>
                <th className="py-2 pr-3 font-medium text-right">Lost</th>
                <th className="py-2 pr-3 font-medium text-right">Conversion</th>
                <th className="py-2 pr-3 font-medium text-right">Won value</th>
                {showSpend && (
                  <th className="py-2 pr-3 font-medium text-right" title="Ad spend per Won deal">
                    Cost / won
                  </th>
                )}
                {showSpend && (
                  <th className="py-2 pr-3 font-medium text-right" title="Won value divided by ad spend — e.g. 4.0× means every Rp1 of ads brought Rp4 of deals">
                    ROAS
                  </th>
                )}
                <th className="py-2 font-medium text-right" title="Estimated value of leads still open">
                  Open pipeline
                </th>
              </tr>
            </thead>
            <tbody className="font-data">
              {rows.map((row) => (
                <tr key={row.ad.id} className="border-b border-[var(--color-border)] align-top">
                  <td className="py-2 pr-3 font-sans min-w-56">
                    <div className="flex flex-col gap-1">
                      {row.ad.business_unit_id ? (
                        <BusinessBadge name={nameOf(row.ad.business_unit_id)} />
                      ) : (
                        <BusinessBadge name={null} />
                      )}
                      <span className="font-medium break-words">
                        {row.ad.headline || "(no headline)"}
                      </span>
                      <span className="text-[11px] text-[var(--color-muted)]">
                        {row.ad.produk ? `${row.ad.produk} · ` : ""}Ad ID {row.ad.source_id}
                      </span>
                    </div>
                  </td>
                  {showSpend && (
                    <td className="py-2 pr-3 text-right whitespace-nowrap">{formatCost(row.spend)}</td>
                  )}
                  <td className="py-2 pr-3 text-right">{row.chats}</td>
                  {showSpend && (
                    <td className="py-2 pr-3 text-right whitespace-nowrap">{formatCost(row.costPerChat)}</td>
                  )}
                  <td className="py-2 pr-3 text-right">{row.leads}</td>
                  {showSpend && (
                    <td className="py-2 pr-3 text-right whitespace-nowrap">{formatCost(row.costPerLead)}</td>
                  )}
                  <td className="py-2 pr-3 text-right">{row.chatToLeadRate.toFixed(0)}%</td>
                  <td className="py-2 pr-3 text-right text-[var(--color-success)]">{row.won}</td>
                  <td className="py-2 pr-3 text-right text-[var(--color-danger)]">{row.lost}</td>
                  <td className="py-2 pr-3 text-right">{row.conversionRate.toFixed(1)}%</td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{formatRupiah(row.wonValue)}</td>
                  {showSpend && (
                    <td className="py-2 pr-3 text-right whitespace-nowrap">{formatCost(row.costPerWon)}</td>
                  )}
                  {showSpend && <td className="py-2 pr-3 text-right">{formatRoas(row.roas)}</td>}
                  <td className="py-2 text-right whitespace-nowrap text-[var(--color-muted)]">
                    {formatRupiah(row.openValue)}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2 pr-3 font-sans">Total ({rows.length} ads)</td>
                {showSpend && (
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{formatCost(total.spend)}</td>
                )}
                <td className="py-2 pr-3 text-right">{total.chats}</td>
                {showSpend && (
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{formatCost(total.costPerChat)}</td>
                )}
                <td className="py-2 pr-3 text-right">{total.leads}</td>
                {showSpend && (
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{formatCost(total.costPerLead)}</td>
                )}
                <td className="py-2 pr-3 text-right">{total.chatToLeadRate.toFixed(0)}%</td>
                <td className="py-2 pr-3 text-right text-[var(--color-success)]">{total.won}</td>
                <td className="py-2 pr-3 text-right text-[var(--color-danger)]">{total.lost}</td>
                <td className="py-2 pr-3 text-right">{total.conversionRate.toFixed(1)}%</td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">{formatRupiah(total.wonValue)}</td>
                {showSpend && (
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{formatCost(total.costPerWon)}</td>
                )}
                {showSpend && <td className="py-2 pr-3 text-right">{formatRoas(total.roas)}</td>}
                <td className="py-2 text-right whitespace-nowrap text-[var(--color-muted)]">
                  {formatRupiah(total.openValue)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
