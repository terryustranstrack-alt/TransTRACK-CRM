"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToProfiles } from "@/lib/push";

export type PushActionState = { error?: string; success?: boolean };

// Bentuk "alamat kirim" dari browser (hasil PushSubscription.toJSON()).
export type BrowserSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// Simpan perangkat ini sebagai penerima notifikasi untuk user yang login.
// Pakai service-role: kalau HP/browser yang sama sebelumnya dipakai akun
// lain, baris lamanya diambil alih oleh akun yang sekarang login.
export async function savePushSubscription(
  sub: BrowserSubscription,
): Promise<PushActionState> {
  const userId = await currentUserId();
  if (!userId) return { error: "Not logged in." };
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { error: "Invalid subscription." };
  }

  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert(
      { profile_id: userId, endpoint: sub.endpoint, keys: sub.keys },
      { onConflict: "endpoint" },
    );
  return error ? { error: error.message } : { success: true };
}

// Hapus perangkat ini dari penerima notifikasi (tombol "Turn off").
export async function removePushSubscription(
  endpoint: string,
): Promise<PushActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  return error ? { error: error.message } : { success: true };
}

// Beri tahu sales bahwa lead baru saja diserahkan kepadanya. Dipanggil dari
// layar setelah penyimpanan berhasil. Server mengecek ulang ke database
// bahwa lead-lead itu MEMANG sekarang dipegang orang tersebut, jadi fungsi
// ini tidak bisa dipakai untuk mengirim notifikasi sembarangan. Tidak
// mengirim ke diri sendiri (kalau sales mengambil lead untuk dirinya).
export async function notifyLeadsAssigned(
  leadIds: string[],
  assigneeId: string | null,
): Promise<void> {
  const userId = await currentUserId();
  if (!userId || !assigneeId || assigneeId === userId || leadIds.length === 0) return;

  const admin = createAdminClient();
  const { data } = await admin
    .from("leads")
    .select("id, nama")
    .in("id", leadIds.slice(0, 500))
    .eq("assigned_to", assigneeId);
  const leads = data ?? [];
  if (leads.length === 0) return;

  await sendPushToProfiles(
    admin,
    [assigneeId],
    leads.length === 1
      ? {
          title: "New lead assigned to you",
          body: leads[0].nama,
          url: `/leads/${leads[0].id}`,
        }
      : {
          title: `${leads.length} leads assigned to you`,
          body: leads.slice(0, 3).map((l) => l.nama).join(", ") +
            (leads.length > 3 ? "…" : ""),
          url: "/prospek",
        },
  );
}
