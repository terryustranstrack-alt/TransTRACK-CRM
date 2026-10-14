import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

// Isi satu notifikasi. `url` = halaman yang dibuka saat notifikasi disentuh;
// `tag` = notifikasi dengan tag sama saling menggantikan (tidak menumpuk).
export type PushPayload = { title: string; body: string; url: string; tag?: string };

type SubscriptionRow = {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

// Kunci VAPID = "tanda tangan" server kita, supaya layanan push browser
// (Google/Apple/Mozilla) mau meneruskan notifikasinya. Kalau belum diisi,
// fitur push dimatikan diam-diam (fungsi kirim tidak melakukan apa-apa).
function configureVapid(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    publicKey,
    privateKey,
  );
  return true;
}

// Kirim ke satu perangkat. Return true kalau perangkat itu sudah tidak
// berlaku lagi (izin dicabut / aplikasi dihapus) supaya bisa dibersihkan.
async function sendToDevice(sub: SubscriptionRow, payload: PushPayload): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload),
    );
    return false;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    return status === 404 || status === 410;
  }
}

// Kirim notifikasi ke semua perangkat milik daftar user ini. `admin` =
// client service-role (perlu membaca perangkat milik orang lain). Perangkat
// yang sudah mati dihapus. Gagal kirim tidak pernah menggagalkan proses
// utama (simpan lead, dll.) — notifikasi sifatnya tambahan.
export async function sendPushToProfiles(
  admin: SupabaseClient,
  profileIds: string[],
  payload: PushPayload,
): Promise<void> {
  const ids = [...new Set(profileIds)];
  if (ids.length === 0 || !configureVapid()) return;

  const { data } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, keys")
    .in("profile_id", ids);
  const subs = (data ?? []) as SubscriptionRow[];

  const results = await Promise.all(subs.map((s) => sendToDevice(s, payload)));
  const dead = subs.filter((_, i) => results[i]).map((s) => s.id);
  if (dead.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", dead);
  }
}

// Siapa yang perlu tahu soal lead/percakapan baru yang belum dipegang
// siapa-siapa di sebuah brand: semua admin + sales di tim brand itu.
export async function brandTeamIds(
  admin: SupabaseClient,
  brandId: string | null,
): Promise<string[]> {
  const { data } = await admin.from("profiles").select("id, is_admin, brand_id");
  return (data ?? [])
    .filter((p) => p.is_admin || (brandId && p.brand_id === brandId))
    .map((p) => p.id);
}
