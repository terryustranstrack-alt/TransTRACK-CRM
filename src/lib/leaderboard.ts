// Perhitungan halaman Leaderboard — fungsi murni (tanpa database) supaya
// mudah diuji. Data mentahnya diambil di src/app/leaderboard/data.ts.

// Kolom lead yang dibutuhkan untuk leaderboard.
export type LeaderboardLead = {
  assigned_to: string | null;
  status: string;
  estimasi_nilai: number | null;
  tanggal_masuk: string;
  tanggal_update: string;
  closed_at: string | null;
};

// Kolom pesan WhatsApp yang dibutuhkan untuk menghitung kecepatan balas.
export type LeaderboardMessage = {
  conversation_id: string;
  direction: "inbound" | "outbound";
  sent_by: string | null;
  sent_by_bot: boolean;
  at: string; // waktu pesan (wa_timestamp, atau created_at kalau kosong)
};

export type LeaderboardTarget = {
  profile_id: string;
  target_won: number;
  target_value: number;
};

export type LeaderboardRow = {
  profileId: string;
  newLeads: number;
  won: number;
  wonValue: number;
  targetWon: number;
  targetValue: number;
  avgReplyMinutes: number | null;
  replies: number; // berapa kali balasan yang diukur
};

// Rentang satu bulan dalam waktu Indonesia (WIB, UTC+7), mis. "2026-10" →
// 1 Okt 00:00 WIB sampai 1 Nov 00:00 WIB. Server Vercel jalan di UTC, jadi
// zona waktunya ditulis eksplisit supaya batas bulan tidak bergeser 7 jam.
export function monthRange(month: string): { start: string; end: string } {
  const [year, m] = month.split("-").map(Number);
  const nextYear = m === 12 ? year + 1 : year;
  const nextMonth = m === 12 ? 1 : m + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${year}-${pad(m)}-01T00:00:00+07:00`,
    end: `${nextYear}-${pad(nextMonth)}-01T00:00:00+07:00`,
  };
}

// Bulan berjalan dalam WIB, format "YYYY-MM".
export function currentMonth(now: Date = new Date()): string {
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, "0")}`;
}

function inRange(iso: string, range: { start: string; end: string }): boolean {
  const t = new Date(iso).getTime();
  return t >= new Date(range.start).getTime() && t < new Date(range.end).getTime();
}

// Kapan lead ditandai Won. Lead lama (sebelum 0021) belum punya closed_at —
// pakai tanggal update terakhir sebagai perkiraan.
function wonAt(lead: LeaderboardLead): string {
  return lead.closed_at ?? lead.tanggal_update;
}

// Kecepatan balas per sales: untuk tiap percakapan, ukur jarak dari pesan
// pelanggan PERTAMA yang belum dibalas sampai balasan manusia berikutnya,
// lalu catat ke sales yang membalas. Balasan bot tidak dihitung dan tidak
// "menutup" penantian — yang diukur adalah seberapa cepat MANUSIA membalas.
export function replyTimesBySales(
  messages: LeaderboardMessage[],
): Map<string, number[]> {
  const byConversation = new Map<string, LeaderboardMessage[]>();
  for (const msg of messages) {
    byConversation.set(msg.conversation_id, [
      ...(byConversation.get(msg.conversation_id) ?? []),
      msg,
    ]);
  }

  const result = new Map<string, number[]>();
  for (const convMessages of byConversation.values()) {
    convMessages.sort((a, b) => (a.at < b.at ? -1 : 1));
    let waitingSince: number | null = null;
    for (const msg of convMessages) {
      if (msg.direction === "inbound") {
        waitingSince ??= new Date(msg.at).getTime();
      } else if (!msg.sent_by_bot && msg.sent_by && waitingSince !== null) {
        const minutes = (new Date(msg.at).getTime() - waitingSince) / 60000;
        result.set(msg.sent_by, [...(result.get(msg.sent_by) ?? []), minutes]);
        waitingSince = null;
      }
    }
  }
  return result;
}

// Susun baris leaderboard untuk satu bulan: lead baru, deal Won + nilainya
// (dibandingkan target), dan rata-rata kecepatan balas WhatsApp. Diurutkan
// dari nilai Won terbesar, lalu jumlah Won.
export function buildLeaderboard(
  profileIds: string[],
  leads: LeaderboardLead[],
  messages: LeaderboardMessage[],
  targets: LeaderboardTarget[],
  month: string,
): LeaderboardRow[] {
  const range = monthRange(month);
  const replyTimes = replyTimesBySales(messages);

  return profileIds
    .map((profileId) => {
      const own = leads.filter((l) => l.assigned_to === profileId);
      const wonLeads = own.filter(
        (l) => l.status === "Closing" && inRange(wonAt(l), range),
      );
      const target = targets.find((t) => t.profile_id === profileId);
      const times = replyTimes.get(profileId) ?? [];
      return {
        profileId,
        newLeads: own.filter((l) => inRange(l.tanggal_masuk, range)).length,
        won: wonLeads.length,
        wonValue: wonLeads.reduce((sum, l) => sum + (l.estimasi_nilai ?? 0), 0),
        targetWon: target?.target_won ?? 0,
        targetValue: Number(target?.target_value ?? 0),
        avgReplyMinutes:
          times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : null,
        replies: times.length,
      };
    })
    .sort((a, b) => b.wonValue - a.wonValue || b.won - a.won);
}
