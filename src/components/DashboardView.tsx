"use client";

import { useState } from "react";
import Dashboard from "@/components/Dashboard";
import ChatMetrics from "@/components/ChatMetrics";
import BusinessFilter from "@/components/BusinessFilter";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { useBrands } from "@/lib/useBrands";
import { useLeadFieldSettings } from "@/lib/useLeadFieldSettings";
import { BUSINESS_FILTER_ALL } from "@/lib/leadFilters";

// Bungkus Dashboard + ChatMetrics dengan satu dropdown brand yang dipakai
// bareng (admin-only — sales biasa cuma pernah lihat brand-nya sendiri lewat
// RLS, jadi tidak perlu dropdown). "Separate dashboard per brand" diwujudkan
// sebagai filter di dashboard yang sama, bukan halaman terpisah.
// Di bawahnya ada filter Business (TransTRACK / Academy) untuk semua user —
// sama seperti di Board & Prospects — yang mempersempit angka-angka lead.
export default function DashboardView() {
  const { profile: currentProfile } = useCurrentProfile();
  const brands = useBrands();
  const { businessUnits } = useLeadFieldSettings();
  const [brandFilter, setBrandFilter] = useState("all");
  const [businessFilter, setBusinessFilter] = useState(BUSINESS_FILTER_ALL);

  return (
    <>
      <div className="px-4 sm:px-8 pt-6 flex flex-wrap items-center gap-3">
        {currentProfile?.is_admin && brands.length > 1 && (
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <BusinessFilter
          value={businessFilter}
          onChange={setBusinessFilter}
          businessUnits={businessUnits}
        />
      </div>
      <Dashboard brandFilter={brandFilter} businessFilter={businessFilter} />
      <ChatMetrics brandFilter={brandFilter} />
    </>
  );
}
