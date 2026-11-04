"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { needsFollowUp, nextStepState } from "@/lib/reminders";
import { groupDuplicates } from "@/lib/duplicates";
import { BUSINESS_FILTER_ALL, matchesBusiness } from "@/lib/leadFilters";
import SourceReport from "@/components/SourceReport";
import AdReport from "@/components/AdReport";
import ForecastCard from "@/components/ForecastCard";
import StatTile, { ChangeHint } from "@/components/StatTile";
import {
  LEAD_STATUSES,
  leadStatusLabel,
  type Lead,
  type LeadStatus,
} from "@/lib/types";

const supabase = createClient();
const SATU_MINGGU_MS = 7 * 24 * 60 * 60 * 1000;

function formatRupiah(n: number) {
  return n.toLocaleString("id-ID", { style: "currency", currency: "IDR" });
}

// Halaman ringkasan performa: total lead, conversion rate, lead masuk
// minggu ini, nilai closing, dan grafik batang distribusi lead per status.
// `brandFilter` ("all" atau id sebuah brand) datang dari DashboardView di
// atasnya — dashboard bisa dipersempit ke satu brand (nomor WhatsApp) saja.
// `businessFilter` (TransTRACK / Academy / tanpa business) juga dari
// DashboardView — angka-angka di bawah hanya menghitung lead business itu.
export default function Dashboard({
  brandFilter = "all",
  businessFilter = BUSINESS_FILTER_ALL,
}: {
  brandFilter?: string;
  businessFilter?: string;
}) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from("leads").select("*");
      if (error) {
        setError(error.message);
      } else {
        setLeads(data as Lead[]);
      }
      setNow(Date.now());
      setLoading(false);
    }
    load();
  }, []);

  const stats = useMemo(() => {
    const leadsInBrand = leads.filter(
      (lead) =>
        (brandFilter === "all" || lead.brand_id === brandFilter) &&
        matchesBusiness(lead, businessFilter),
    );
    const totalLeads = leadsInBrand.length;
    // Jumlah lead + total estimasi nilainya, dikelompokkan per status —
    // dipakai untuk grafik batang "Distribusi Pipeline".
    const perStatus = LEAD_STATUSES.map((status) => {
      const leadsInStatus = leadsInBrand.filter((lead) => lead.status === status);
      const totalNilai = leadsInStatus.reduce(
        (sum, lead) => sum + (lead.estimasi_nilai ?? 0),
        0,
      );
      return { status, count: leadsInStatus.length, totalNilai };
    });

    const closingCount =
      perStatus.find((statusGroup) => statusGroup.status === "Closing")
        ?.count ?? 0;
    const conversionRate = totalLeads > 0 ? (closingCount / totalLeads) * 100 : 0;

    const leadsMingguIni = leadsInBrand.filter(
      (lead) => now - new Date(lead.tanggal_masuk).getTime() <= SATU_MINGGU_MS,
    ).length;
    // Lead masuk 7 hari SEBELUMNYA (hari ke-8 s/d ke-14 yang lalu) — untuk
    // keterangan "naik/turun dibanding minggu lalu" di kotak angka.
    const leadsMingguLalu = leadsInBrand.filter((lead) => {
      const age = now - new Date(lead.tanggal_masuk).getTime();
      return age > SATU_MINGGU_MS && age <= 2 * SATU_MINGGU_MS;
    }).length;

    // Total estimasi nilai dari lead yang masih "hidup" (belum closing,
    // belum hilang) — potensi revenue yang belum terealisasi.
    const pipelineAktif = leadsInBrand
      .filter((lead) => lead.status !== "Closing" && lead.status !== "Hilang")
      .reduce((sum, lead) => sum + (lead.estimasi_nilai ?? 0), 0);

    const nilaiClosing =
      perStatus.find((statusGroup) => statusGroup.status === "Closing")
        ?.totalNilai ?? 0;

    // Lead yang perlu di-follow-up sekarang (tanggal "next step" sudah lewat/
    // jatuh tempo hari ini, atau — kalau belum diisi — sudah lama diam).
    // Diurutkan: yang punya tanggal jatuh tempo paling awal dulu, lalu yang
    // tidak punya tanggal (pakai tanggal update terlama).
    const followUpLeads = leadsInBrand
      .filter((lead) =>
        needsFollowUp(lead.status, lead.tanggal_update, lead.next_step_due),
      )
      .sort((a, b) => {
        const aKey = a.next_step_due?.slice(0, 10) ?? "9999-12-31";
        const bKey = b.next_step_due?.slice(0, 10) ?? "9999-12-31";
        if (aKey !== bKey) return aKey < bKey ? -1 : 1;
        return a.tanggal_update < b.tanggal_update ? -1 : 1;
      });

    // Grup lead yang nomor telepon / email-nya sama — kemungkinan duplikat.
    const duplicateGroups = groupDuplicates(leadsInBrand);

    return {
      leadsInBrand,
      totalLeads,
      perStatus,
      conversionRate,
      leadsMingguIni,
      leadsMingguLalu,
      pipelineAktif,
      nilaiClosing,
      followUpLeads,
      duplicateGroups,
    };
  }, [leads, now, brandFilter, businessFilter]);

  if (loading) return <DashboardSkeleton />;
  if (error) {
    return (
      <p className="text-sm text-[var(--color-danger)]">Failed to load: {error}</p>
    );
  }

  // Dipakai sebagai penyebut supaya lebar batang grafik proporsional
  // (status dengan lead terbanyak = 100% lebar). Minimal 1 supaya tidak
  // pernah dibagi nol saat semua status masih kosong.
  const maxCount = Math.max(
    1,
    ...stats.perStatus.map((statusGroup) => statusGroup.count),
  );

  return (
    <>
      {/* Angka ringkasan. Conversion rate = satu-satunya angka merah
          (aksen brand) di layar ini — lihat catatan warna di globals.css. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Total leads" value={stats.totalLeads} />
        <StatTile
          label="Conversion rate"
          value={`${stats.conversionRate.toFixed(1)}%`}
          tone="accent"
          hint="Leads that reached Won"
        />
        <StatTile
          label="New leads this week"
          value={stats.leadsMingguIni}
          hint={
            <ChangeHint
              current={stats.leadsMingguIni}
              previous={stats.leadsMingguLalu}
              label="last week"
            />
          }
        />
        <StatTile
          label="Won value"
          value={formatRupiah(stats.nilaiClosing)}
          tone="success"
        />
      </div>

      {/* Dua kolom di layar lebar: analisis di kiri, daftar "perlu
          ditindaklanjuti" di kanan. Di telepon kolom kanan tampil PALING
          ATAS (order-first) karena itu yang paling perlu dikerjakan. */}
      <div className="grid gap-6 lg:grid-cols-3 items-start">
        <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
          <PipelineCard
            perStatus={stats.perStatus}
            pipelineAktif={stats.pipelineAktif}
            maxCount={maxCount}
          />
          <ForecastCard leads={stats.leadsInBrand} />
          <SourceReport leads={stats.leadsInBrand} />
        </div>

        <div className="order-first lg:order-none flex flex-col gap-6 min-w-0">
          <FollowUpCard leads={stats.followUpLeads} />
          {stats.duplicateGroups.length > 0 && (
            <div className="card p-5">
              <h2 className="card-title mb-1">Possible duplicate leads</h2>
              <p className="text-xs text-[var(--color-muted)] mb-3">
                {stats.duplicateGroups.length} group
                {stats.duplicateGroups.length === 1 ? "" : "s"} of leads share a
                phone or email
              </p>
              <Link href="/prospek" className="text-sm text-accent hover:underline">
                Review in Prospects →
              </Link>
            </div>
          )}
        </div>
      </div>

      <AdReport leads={stats.leadsInBrand} brandFilter={brandFilter} />
    </>
  );
}

// Status "hasil akhir" (menang/kalah) diberi warna sesuai artinya di
// grafik batang; status yang masih berjalan tetap warna brand netral.
const BAR_COLOR: Partial<Record<LeadStatus, string>> = {
  Closing: "bg-[var(--color-success)]",
  Hilang: "bg-[var(--color-danger)]",
};

// Kartu "Pipeline distribution": grafik batang jumlah lead per status.
function PipelineCard({
  perStatus,
  pipelineAktif,
  maxCount,
}: {
  perStatus: { status: LeadStatus; count: number; totalNilai: number }[];
  pipelineAktif: number;
  maxCount: number;
}) {
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="card-title">Pipeline distribution</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Active potential{" "}
          <span className="font-data font-semibold text-foreground">
            {formatRupiah(pipelineAktif)}
          </span>
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {perStatus.map((statusGroup) => (
          <div key={statusGroup.status}>
            <div className="flex justify-between text-sm mb-1">
              <span>{leadStatusLabel(statusGroup.status)}</span>
              <span className="font-data text-xs text-[var(--color-muted)]">
                {statusGroup.count} · {formatRupiah(statusGroup.totalNilai)}
              </span>
            </div>
            <div className="h-2 bg-[var(--color-muted-bg)] rounded-full overflow-hidden">
              <div
                className={`h-2 rounded-full transition-[width] ${
                  BAR_COLOR[statusGroup.status] ?? "bg-brand"
                }`}
                style={{ width: `${(statusGroup.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Kartu "Needs follow-up": lead yang jatuh tempo / sudah lama diam, yang
// paling mendesak di atas. Tanggal lewat = merah, hari ini = oranye.
function FollowUpCard({ leads }: { leads: Lead[] }) {
  const SHOWN = 8;
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h2 className="card-title">Needs follow-up</h2>
        <span className="font-data text-xs font-semibold rounded-full bg-[var(--color-muted-bg)] px-2 py-0.5">
          {leads.length}
        </span>
      </div>
      <p className="text-xs text-[var(--color-muted)] mb-4">
        Leads waiting on a next step
      </p>
      {leads.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">Nothing overdue. Nice.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--color-border)]">
          {leads.slice(0, SHOWN).map((lead) => {
            const state = nextStepState(lead.next_step_due);
            return (
              <li key={lead.id} className="py-2.5 first:pt-0 flex flex-col gap-0.5 min-w-0">
                <Link
                  href={`/leads/${lead.id}`}
                  className="text-sm font-medium hover:underline truncate"
                >
                  {lead.nama}
                </Link>
                <span className="text-xs text-[var(--color-muted)] truncate">
                  {lead.next_step ? (
                    <>
                      {lead.next_step}
                      {lead.next_step_due && (
                        <span
                          className={
                            state === "overdue"
                              ? " text-[var(--color-danger)] font-medium"
                              : state === "today"
                                ? " text-[var(--color-warning)] font-medium"
                                : ""
                          }
                        >
                          {" · "}
                          {new Date(lead.next_step_due).toLocaleDateString("id-ID")}
                        </span>
                      )}
                    </>
                  ) : (
                    `Idle since ${new Date(lead.tanggal_update).toLocaleDateString("id-ID")}`
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {leads.length > SHOWN && (
        <Link href="/prospek" className="text-sm text-accent hover:underline mt-3 inline-block">
          View all {leads.length} in Prospects →
        </Link>
      )}
    </div>
  );
}

// Kerangka abu-abu berdenyut selama data dashboard dimuat (pengganti
// tulisan "Loading…").
function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-[88px]" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="skeleton h-72 lg:col-span-2" />
        <div className="skeleton h-72" />
      </div>
    </>
  );
}
