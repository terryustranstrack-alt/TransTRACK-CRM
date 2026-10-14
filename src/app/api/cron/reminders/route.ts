import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { sendPushToProfiles } from "@/lib/push";
import { buildDigests, digestMessage, type DigestLead } from "@/lib/reminderDigest";

export const dynamic = "force-dynamic";

// Pengingat follow-up harian. Dipanggil otomatis oleh penjadwal Vercel
// (lihat "crons" di vercel.json) setiap pagi pukul 08:00 WIB. Tiap sales
// yang punya lead perlu di-follow-up mendapat SATU notifikasi push berisi
// ringkasannya. Hanya mengingatkan — tidak pernah mengirim pesan ke pelanggan.
//
// Keamanan: Vercel mengirim header "Authorization: Bearer <CRON_SECRET>".
// Tanpa header itu (orang lain membuka alamat ini) permintaan ditolak.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const leads = await fetchAll<DigestLead>((from, to) =>
    admin
      .from("leads")
      .select("nama, status, tanggal_update, next_step_due, assigned_to")
      .not("assigned_to", "is", null)
      .not("status", "in", "(Closing,Hilang)")
      .order("id")
      .range(from, to),
  );

  const digests = buildDigests(leads);
  for (const [profileId, digest] of digests) {
    await sendPushToProfiles(admin, [profileId], {
      ...digestMessage(digest),
      url: "/dashboard",
      tag: "daily-reminder",
    });
  }

  return Response.json({ salespeopleReminded: digests.size });
}
