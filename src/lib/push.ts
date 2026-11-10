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

// Notifikasi "pesan WhatsApp baru masuk" — supaya sales tahu walau aplikasi
// / tab CRM sedang ditutup. Penerima: sales yang memegang percakapan; kalau
// belum ada yang pegang, tim sales business chat itu (TransTRACK / Academy,
// kalau sudah dikenali) + admin. Tag per percakapan: beberapa pesan beruntun
// dari kontak yang sama cuma jadi SATU notifikasi (yang terbaru menggantikan
// yang lama), tidak menumpuk.
export async function notifyInboundMessage(
  admin: SupabaseClient,
  chat: {
    conversationId: string;
    assignedTo: string | null;
    brandId: string | null;
    senderName: string;
    preview: string;
  },
): Promise<void> {
  const recipients = chat.assignedTo
    ? [chat.assignedTo]
    : await brandTeamIds(
        admin,
        chat.brandId,
        await conversationBusinessId(admin, chat.conversationId),
      );
  await sendPushToProfiles(admin, recipients, {
    title: `💬 ${chat.senderName}`,
    body: chat.preview,
    // ?c=<id> → inbox langsung membuka chat ini saat notifikasi disentuh.
    url: `/inbox?c=${chat.conversationId}`,
    tag: `chat-${chat.conversationId}`,
  });
}

// Business (TransTRACK / Academy) hasil deteksi untuk sebuah percakapan,
// atau null kalau belum dikenali.
async function conversationBusinessId(
  admin: SupabaseClient,
  conversationId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("conversations")
    .select("business_unit_id")
    .eq("id", conversationId)
    .maybeSingle();
  return data?.business_unit_id ?? null;
}

// Daftar tim business per sales: profile id → business yang dia tangani.
// Kalau tabelnya belum ada (migrasi 0032 belum dijalankan), dianggap semua
// sales belum punya tim — perilaku lama.
async function businessTeams(admin: SupabaseClient): Promise<Map<string, string[]>> {
  const { data, error } = await admin
    .from("profile_business_units")
    .select("profile_id, business_unit_id");
  const teams = new Map<string, string[]>();
  if (error) return teams;
  for (const row of data ?? []) {
    teams.set(row.profile_id, [...(teams.get(row.profile_id) ?? []), row.business_unit_id]);
  }
  return teams;
}

// Siapa yang perlu tahu soal lead/percakapan baru yang belum dipegang
// siapa-siapa: semua admin + sales di brand itu. Kalau business-nya sudah
// dikenali, cuma sales di tim business itu (sales yang belum dimasukkan ke
// tim mana pun tetap ikut menerima). Aturan ini sama dengan siapa yang
// boleh MELIHAT chat belum-diklaim (lihat migrasi 0032).
export async function brandTeamIds(
  admin: SupabaseClient,
  brandId: string | null,
  businessUnitId: string | null = null,
): Promise<string[]> {
  const [{ data }, teams] = await Promise.all([
    admin.from("profiles").select("id, is_admin, brand_id"),
    businessTeams(admin),
  ]);
  return (data ?? [])
    .filter((p) => {
      if (p.is_admin) return true;
      if (!brandId || p.brand_id !== brandId) return false;
      const team = teams.get(p.id);
      return !businessUnitId || !team || team.includes(businessUnitId);
    })
    .map((p) => p.id);
}
