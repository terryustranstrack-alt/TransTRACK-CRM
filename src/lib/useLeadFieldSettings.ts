"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  BusinessUnit,
  LeadCustomField,
  LeadProduct,
  LeadSource,
} from "@/lib/types";

const supabase = createClient();

export type LeadFieldSettings = {
  businessUnits: BusinessUnit[];
  products: LeadProduct[];
  sources: LeadSource[];
  customFields: LeadCustomField[];
};

const EMPTY: LeadFieldSettings = {
  businessUnits: [],
  products: [],
  sources: [],
  customFields: [],
};

// Ambil semua daftar yang diatur admin di Settings > "Lead fields":
// business, product, source, dan field tambahan. Dipakai form lead (untuk
// isi dropdown) dan halaman Settings (untuk dikelola). `reload` dipanggil
// setelah admin menambah/menghapus sesuatu.
export function useLeadFieldSettings() {
  const [settings, setSettings] = useState<LeadFieldSettings>(EMPTY);

  const reload = useCallback(async () => {
    const [businessUnits, products, sources, customFields] = await Promise.all([
      supabase.from("business_units").select("*").order("name"),
      supabase.from("lead_products").select("*").order("name"),
      supabase.from("lead_sources").select("*").order("name"),
      supabase.from("lead_custom_fields").select("*").order("created_at"),
    ]);
    setSettings({
      businessUnits: (businessUnits.data ?? []) as BusinessUnit[],
      products: (products.data ?? []) as LeadProduct[],
      sources: (sources.data ?? []) as LeadSource[],
      customFields: (customFields.data ?? []) as LeadCustomField[],
    });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  return { ...settings, reload };
}

// Produk yang boleh dipilih untuk business tertentu: produk umum (tanpa
// business) + produk milik business itu. Kalau business belum dipilih,
// tampilkan semua produk.
export function productsForBusiness(
  products: LeadProduct[],
  businessUnitId: string,
): string[] {
  return products
    .filter(
      (p) =>
        !businessUnitId ||
        !p.business_unit_id ||
        p.business_unit_id === businessUnitId,
    )
    .map((p) => p.name);
}

// Sama seperti di atas, untuk field tambahan.
export function customFieldsForBusiness(
  fields: LeadCustomField[],
  businessUnitId: string,
): LeadCustomField[] {
  return fields.filter(
    (f) =>
      !businessUnitId ||
      !f.business_unit_id ||
      f.business_unit_id === businessUnitId,
  );
}
