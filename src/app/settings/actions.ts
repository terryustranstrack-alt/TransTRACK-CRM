"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  applyDetectionToLead,
  saveConversationDetection,
} from "@/lib/businessDetection";
import type { BusinessDetectionLayer } from "@/lib/types";

export type SettingsActionState = { error?: string; updatedChats?: number };

// Pastikan pemanggil sudah login & admin.
async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  return profile?.is_admin ?? false;
}

// Admin memetakan satu iklan Meta ke Business (+ Product). Setelah disimpan,
// semua chat yang SUDAH masuk dari iklan itu ikut diperbarui, dan lead-nya
// diisi kalau field-nya masih kosong — jadi tidak perlu menunggu chat baru.
// Mengosongkan pemetaan tidak mengubah chat/lead yang sudah terisi.
export async function assignAdSource(
  adSourceId: string,
  businessUnitId: string | null,
  produk: string | null,
): Promise<SettingsActionState> {
  if (!(await requireAdmin())) return { error: "Admins only." };
  const admin = createAdminClient();

  const { error } = await admin
    .from("ad_sources")
    .update({ business_unit_id: businessUnitId, produk })
    .eq("id", adSourceId);
  if (error) return { error: error.message };
  if (!businessUnitId) {
    revalidatePath("/settings");
    return { updatedChats: 0 };
  }

  const { data: chats } = await admin
    .from("conversations")
    .select("id, business_detected_by")
    .eq("ad_source_id", adSourceId);

  let updatedChats = 0;
  for (const chat of chats ?? []) {
    const saved = await saveConversationDetection(
      admin,
      chat.id,
      chat.business_detected_by as BusinessDetectionLayer | null,
      { businessUnitId, produk, by: "ad" },
    );
    if (saved) updatedChats++;
    await applyDetectionToLead(admin, chat.id);
  }

  revalidatePath("/settings");
  revalidatePath("/inbox");
  return { updatedChats };
}
