"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildAdReport, totalAdReport } from "@/lib/adReport";
import {
  BUSINESS_FILTER_ALL,
  BUSINESS_FILTER_NONE,
  matchesDateRange,
  toLocalDateInputValue,
} from "@/lib/leadFilters";
import { useLeadFieldSettings } from "@/lib/useLeadFieldSettings";
import BusinessBadge from "@/components/BusinessBadge";
import BusinessFilter from "@/components/BusinessFilter";
import type { AdSource, Lead } from "@/lib/types";

const supabase = createClient();

type ChatRow = { ad_source_id: string; created_at: string; brand_id: string | null };

function formatRupiah(n: number) {
  return n.toLocaleString("id-ID", { style: "currency", currency: "IDR" });
}

// Chat masuk di rentang tanggal yang dipilih? (kosong = tidak dibatasi)
function chatInRange(chat: ChatRow, from: string, to: string): boolean {
  const day = toLocalDateInputValue(chat.created_at);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

// Kartu "Ad performance" di Dashboard: per iklan Meta (Click-to-WhatsApp) —
// berapa chat yang masuk, berapa jadi lead, berapa Won/Lost, dan nilai
// yang dihasilkan. Bisa difilter per Business dan rentang tanggal.
// `leads` & `brandFilter` datang dari Dashboard (sudah difilter per brand).
export default function AdReport({
  leads,
  brandFilter,
}: {
  leads: Lead[];
  brandFilter: string;
}) {
  const { businessUnits } = useLeadFieldSettings();
  const [ads, setAds] = useState<AdSource[]>([]);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [businessFilter, setBusinessFilter] = useState(BUSINESS_FILTER_ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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
      .filter((c) => chatInRange(c, dateFrom, dateTo))
      .map((c) => c.ad_source_id);
    const leadsInRange = leads.filter((l) =>
      matchesDateRange(l, "tanggal_masuk", dateFrom, dateTo),
    );
    return buildAdReport(adsInBusiness, leadsInRange, chatAdIds);
  }, [ads, chats, leads, businessFilter, brandFilter, dateFrom, dateTo]);

  const total = totalAdReport(rows);
  const nameOf = (id: string | null) => businessUnits.find((b) => b.id === id)?.name;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="font-medium">Ad performance</h2>
          <p className="text-xs text-[var(--color-muted)]">
            Meta Click-to-WhatsApp ads — chats, leads and deals per ad
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[var(--color-muted)]">From</span>
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="From date"
            className="border border-[var(--color-border)] rounded-lg px-2 py-1"
          />
          <span className="text-[var(--color-muted)]">to</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="To date"
            className="border border-[var(--color-border)] rounded-lg px-2 py-1"
          />
        </div>
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
                <th className="py-2 pr-3 font-medium text-right">Chats</th>
                <th className="py-2 pr-3 font-medium text-right">Leads</th>
                <th className="py-2 pr-3 font-medium text-right" title="Share of chats that became a lead">
                  Chat → lead
                </th>
                <th className="py-2 pr-3 font-medium text-right">Won</th>
                <th className="py-2 pr-3 font-medium text-right">Lost</th>
                <th className="py-2 pr-3 font-medium text-right">Conversion</th>
                <th className="py-2 pr-3 font-medium text-right">Won value</th>
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
                  <td className="py-2 pr-3 text-right">{row.chats}</td>
                  <td className="py-2 pr-3 text-right">{row.leads}</td>
                  <td className="py-2 pr-3 text-right">{row.chatToLeadRate.toFixed(0)}%</td>
                  <td className="py-2 pr-3 text-right text-[var(--color-success)]">{row.won}</td>
                  <td className="py-2 pr-3 text-right text-[var(--color-danger)]">{row.lost}</td>
                  <td className="py-2 pr-3 text-right">{row.conversionRate.toFixed(1)}%</td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{formatRupiah(row.wonValue)}</td>
                  <td className="py-2 text-right whitespace-nowrap text-[var(--color-muted)]">
                    {formatRupiah(row.openValue)}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2 pr-3 font-sans">Total ({rows.length} ads)</td>
                <td className="py-2 pr-3 text-right">{total.chats}</td>
                <td className="py-2 pr-3 text-right">{total.leads}</td>
                <td className="py-2 pr-3 text-right">{total.chatToLeadRate.toFixed(0)}%</td>
                <td className="py-2 pr-3 text-right text-[var(--color-success)]">{total.won}</td>
                <td className="py-2 pr-3 text-right text-[var(--color-danger)]">{total.lost}</td>
                <td className="py-2 pr-3 text-right">{total.conversionRate.toFixed(1)}%</td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">{formatRupiah(total.wonValue)}</td>
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
