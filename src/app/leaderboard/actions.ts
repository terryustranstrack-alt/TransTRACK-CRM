"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type TargetActionState = { error?: string; success?: boolean };

// Simpan target bulanan satu sales (jumlah deal Won + nilai Won). Pakai
// client biasa (bukan service-role): aturan akses database sudah membatasi
// hanya admin yang boleh menulis ke sales_targets.
export async function setSalesTarget(
  profileId: string,
  month: string,
  targetWon: number,
  targetValue: number,
): Promise<TargetActionState> {
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Invalid month." };
  if (targetWon < 0 || targetValue < 0) {
    return { error: "Targets can't be negative." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("sales_targets").upsert(
    {
      profile_id: profileId,
      month: `${month}-01`,
      target_won: Math.round(targetWon),
      target_value: targetValue,
    },
    { onConflict: "profile_id,month" },
  );
  if (error) return { error: error.message };

  revalidatePath("/leaderboard");
  return { success: true };
}
