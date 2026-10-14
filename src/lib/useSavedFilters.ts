"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LeadDateField } from "@/lib/leadFilters";

const supabase = createClient();

// Semua filter di halaman Prospects yang ikut disimpan di sebuah "saved view".
export type ProspectFilters = {
  search: string;
  sourceFilter: string;
  followUpOnly: boolean;
  dateField: LeadDateField;
  dateFrom: string;
  dateTo: string;
  brandFilter: string;
};

export type SavedFilter = {
  id: string;
  name: string;
  filters: ProspectFilters;
};

// Daftar saved view milik user yang sedang login (RLS memastikan cuma
// miliknya sendiri), plus fungsi simpan & hapus. Setelah simpan/hapus,
// daftar dimuat ulang. Return dari save/remove: pesan error atau null.
export function useSavedFilters() {
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);

  async function reload() {
    const { data } = await supabase
      .from("saved_filters")
      .select("id, name, filters")
      .order("name", { ascending: true });
    if (data) setSavedFilters(data as SavedFilter[]);
  }

  async function save(name: string, filters: ProspectFilters) {
    const { error } = await supabase
      .from("saved_filters")
      .insert({ name, filters });
    if (!error) await reload();
    return error?.message ?? null;
  }

  async function remove(id: string) {
    const { error } = await supabase.from("saved_filters").delete().eq("id", id);
    if (!error) await reload();
    return error?.message ?? null;
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, []);

  return { savedFilters, save, remove };
}
