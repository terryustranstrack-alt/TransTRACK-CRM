import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetchAll";
import {
  buildLeaderboard,
  monthRange,
  type LeaderboardLead,
  type LeaderboardMessage,
  type LeaderboardRow,
  type LeaderboardTarget,
} from "@/lib/leaderboard";


// Semua lead yang punya pemegang — hanya kolom yang dibutuhkan untuk angka.
function fetchLeads(admin: SupabaseClient) {
  return fetchAll<LeaderboardLead>((from, to) =>
    admin
      .from("leads")
      .select("assigned_to, status, estimasi_nilai, tanggal_masuk, tanggal_update, closed_at")
      .not("assigned_to", "is", null)
      .order("id")
      .range(from, to),
  );
}

// Pesan WhatsApp di bulan itu (untuk kecepatan balas), tanpa isi pesannya.
async function fetchMessages(
  admin: SupabaseClient,
  range: { start: string; end: string },
): Promise<LeaderboardMessage[]> {
  const rows = await fetchAll<{
    conversation_id: string;
    direction: "inbound" | "outbound";
    sent_by: string | null;
    sent_by_bot: boolean;
    wa_timestamp: string | null;
    created_at: string;
  }>((from, to) =>
    admin
      .from("messages")
      .select("conversation_id, direction, sent_by, sent_by_bot, wa_timestamp, created_at")
      .gte("created_at", range.start)
      .lt("created_at", range.end)
      .order("id")
      .range(from, to),
  );
  return rows.map((r) => ({ ...r, at: r.wa_timestamp ?? r.created_at }));
}

async function fetchTargets(
  admin: SupabaseClient,
  month: string,
): Promise<LeaderboardTarget[]> {
  const { data, error } = await admin
    .from("sales_targets")
    .select("profile_id, target_won, target_value")
    .eq("month", `${month}-01`);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type LeaderboardProfile = { id: string; label: string };

// Siapa saja yang tampil: semua sales (non-admin), plus admin yang ikut
// memegang lead (admin yang juga jualan).
async function fetchProfiles(
  admin: SupabaseClient,
  leads: LeaderboardLead[],
): Promise<LeaderboardProfile[]> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, email, is_admin")
    .order("full_name");
  if (error) throw new Error(error.message);
  const holders = new Set(leads.map((l) => l.assigned_to));
  return (data ?? [])
    .filter((p) => !p.is_admin || holders.has(p.id))
    .map((p) => ({ id: p.id, label: p.full_name || p.email || p.id }));
}

// Data lengkap leaderboard satu bulan. Pakai service-role (melewati aturan
// akses per sales) karena leaderboard perlu menghitung SEMUA sales — tapi
// yang dikirim ke halaman hanya angka ringkasan, tidak pernah data lead.
export async function loadLeaderboard(month: string): Promise<{
  profiles: LeaderboardProfile[];
  rows: LeaderboardRow[];
}> {
  const admin = createAdminClient();
  const [leads, messages, targets] = await Promise.all([
    fetchLeads(admin),
    fetchMessages(admin, monthRange(month)),
    fetchTargets(admin, month),
  ]);
  const profiles = await fetchProfiles(admin, leads);
  const rows = buildLeaderboard(
    profiles.map((p) => p.id),
    leads,
    messages,
    targets,
    month,
  );
  return { profiles, rows };
}
