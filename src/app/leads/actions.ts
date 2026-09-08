"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sameContact } from "@/lib/duplicates";

export type LeadActionState = { error?: string; success?: boolean } | undefined;

// Info ringkas satu lead yang cocok — dipakai untuk peringatan duplikat di
// form Add Lead. Sengaja minimal: cukup untuk sales memutuskan, tidak
// membocorkan seluruh data lead milik orang lain.
export type DuplicateMatch = {
  id: string;
  nama: string;
  kontak: string;
  status: string;
  owner: string | null; // nama sales pemilik, atau null kalau belum di-assign
};

// Cari lead lain yang nomor telepon / email-nya sama dengan calon lead baru.
// Dijalankan dengan service-role supaya sales tetap diperingatkan soal
// duplikat yang dipegang sales LAIN (yang normalnya tidak terlihat karena
// RLS silo per-sales).
export async function checkLeadDuplicates(input: {
  kontak: string;
  email?: string | null;
  excludeId?: string;
}): Promise<DuplicateMatch[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  if (!input.kontak.trim() && !input.email?.trim()) return [];

  const admin = createAdminClient();
  const { data: leads } = await admin
    .from("leads")
    .select("id, nama, kontak, email, status, assigned_to");
  if (!leads) return [];

  const candidate = { kontak: input.kontak, email: input.email ?? null };
  const matches = leads.filter(
    (lead) => lead.id !== input.excludeId && sameContact(candidate, lead),
  );
  if (matches.length === 0) return [];

  // Ambil nama pemilik untuk tiap lead yang cocok (kalau ada).
  const ownerIds = [
    ...new Set(matches.map((m) => m.assigned_to).filter((id): id is string => !!id)),
  ];
  const { data: profiles } =
    ownerIds.length > 0
      ? await admin
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ownerIds)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };

  function ownerName(id: string | null): string | null {
    if (!id) return null;
    const profile = (profiles ?? []).find((p) => p.id === id);
    return profile?.full_name || profile?.email || null;
  }

  return matches.map((m) => ({
    id: m.id,
    nama: m.nama,
    kontak: m.kontak,
    status: m.status,
    owner: ownerName(m.assigned_to),
  }));
}

// Field lead yang boleh dipilih sumbernya saat menggabungkan dua lead.
const MERGEABLE_FIELDS = [
  "nama",
  "kontak",
  "sumber",
  "produk",
  "estimasi_nilai",
  "kota",
  "perusahaan",
  "jabatan",
  "email",
  "catatan",
  "next_step",
  "next_step_due",
  "assigned_to",
] as const;

export type MergeField = (typeof MERGEABLE_FIELDS)[number];
export type MergeChoices = Partial<Record<MergeField, "primary" | "secondary">>;

// Sebuah nilai dianggap "kosong" (boleh ditimpa oleh nilai dari lead lain).
function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

// Gabungkan dua lead jadi satu. HANYA admin — menggabungkan bisa menyatukan
// lead milik dua sales berbeda, jadi operasi ini sensitif.
//
// Langkahnya: pindahkan seluruh riwayat aktivitas & percakapan WhatsApp dari
// lead "secondary" ke lead "primary", terapkan nilai field hasil pilihan,
// catat satu baris riwayat di primary, lalu hapus lead secondary.
export async function mergeLeads(
  primaryId: string,
  secondaryId: string,
  choices: MergeChoices = {},
): Promise<LeadActionState> {
  if (primaryId === secondaryId) {
    return { error: "Pick two different leads to merge." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) {
    return { error: "Only admins can merge leads." };
  }

  const admin = createAdminClient();
  const { data: leads } = await admin
    .from("leads")
    .select("*")
    .in("id", [primaryId, secondaryId]);
  const primary = leads?.find((l) => l.id === primaryId);
  const secondary = leads?.find((l) => l.id === secondaryId);
  if (!primary || !secondary) {
    return { error: "One of the leads no longer exists." };
  }

  // Nilai akhir per field: default ikut primary; kalau primary kosong tapi
  // secondary ada isinya, ambil secondary. `choices` menimpa default untuk
  // field yang dipilih manual di layar merge.
  const merged: Record<string, unknown> = {};
  for (const field of MERGEABLE_FIELDS) {
    const primaryValue = (primary as Record<string, unknown>)[field];
    const secondaryValue = (secondary as Record<string, unknown>)[field];
    const choice = choices[field];
    if (choice === "secondary") {
      merged[field] = secondaryValue;
    } else if (choice === "primary") {
      merged[field] = primaryValue;
    } else {
      merged[field] =
        isEmptyValue(primaryValue) && !isEmptyValue(secondaryValue)
          ? secondaryValue
          : primaryValue;
    }
  }
  merged.tanggal_update = new Date().toISOString();

  // 1. Pindahkan riwayat & percakapan ke lead primary.
  await admin
    .from("lead_activities")
    .update({ lead_id: primaryId })
    .eq("lead_id", secondaryId);
  await admin
    .from("conversations")
    .update({ lead_id: primaryId })
    .eq("lead_id", secondaryId);

  // 2. Terapkan nilai gabungan ke lead primary.
  const { error: updateError } = await admin
    .from("leads")
    .update(merged)
    .eq("id", primaryId);
  if (updateError) return { error: updateError.message };

  // 3. Catat penggabungan di riwayat lead primary.
  await admin.from("lead_activities").insert({
    lead_id: primaryId,
    type: "note",
    content: `Merged lead "${secondary.nama}" (${secondary.kontak}) into this record.`,
    created_by: user.id,
  });

  // 4. Hapus lead secondary.
  const { error: deleteError } = await admin
    .from("leads")
    .delete()
    .eq("id", secondaryId);
  if (deleteError) return { error: deleteError.message };

  revalidatePath("/prospek");
  revalidatePath("/");
  revalidatePath(`/leads/${primaryId}`);
  return { success: true };
}
