"use client";

import { useState } from "react";
import Dashboard from "@/components/Dashboard";
import ChatMetrics from "@/components/ChatMetrics";
import BusinessFilter from "@/components/BusinessFilter";
import DateRangeFilter from "@/components/DateRangeFilter";
import PageHeader from "@/components/PageHeader";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { useBrands } from "@/lib/useBrands";
import { useLeadFieldSettings } from "@/lib/useLeadFieldSettings";
import { BUSINESS_FILTER_ALL } from "@/lib/leadFilters";
import { ALL_TIME, type DateRange } from "@/lib/dateRange";

// Halaman Dashboard: judul + filter di atas, lalu ringkasan lead (Dashboard)
// dan statistik WhatsApp (ChatMetrics). Lebar penuh sampai 1280px supaya
// layar laptop terpakai (dulu cuma ~770px dan tabel iklan harus digeser).
// Dropdown brand khusus admin — sales biasa cuma pernah lihat brand-nya
// sendiri lewat RLS. Filter Business (TransTRACK / Academy) untuk semua
// user, sama seperti di Board & Prospects. Periode (All time / 7 / 30 hari /
// Custom) berlaku untuk semua angka yang bergantung waktu di halaman ini.
export default function DashboardView() {
  const { profile: currentProfile } = useCurrentProfile();
  const brands = useBrands();
  const { businessUnits } = useLeadFieldSettings();
  const [brandFilter, setBrandFilter] = useState("all");
  const [businessFilter, setBusinessFilter] = useState(BUSINESS_FILTER_ALL);
  const [dateRange, setDateRange] = useState<DateRange>(ALL_TIME);

  return (
    <main className="p-4 sm:p-8 flex flex-col gap-6 w-full max-w-7xl">
      <PageHeader
        title="Dashboard"
        description="Leads, pipeline and WhatsApp activity at a glance"
        actions={
          currentProfile?.is_admin &&
          brands.length > 1 && (
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              aria-label="Filter by brand"
              className="field"
            >
              <option value="all">All brands</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )
        }
      />
      <div className="flex flex-col gap-3">
        <BusinessFilter
          value={businessFilter}
          onChange={setBusinessFilter}
          businessUnits={businessUnits}
        />
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>
      <Dashboard
        brandFilter={brandFilter}
        businessFilter={businessFilter}
        dateRange={dateRange}
      />
      <ChatMetrics brandFilter={brandFilter} dateRange={dateRange} />
    </main>
  );
}
