import type { LeadActivity, Message } from "@/lib/types";

// Jenis entri di timeline lead — dipakai untuk ikon & tombol filter.
//  chat   = pesan WhatsApp (masuk / keluar / bot)
//  status = perubahan tahap (termasuk alasan Won/Lost)
//  note   = catatan yang ditulis manual oleh sales
//  update = catatan otomatis sistem (data lead diubah, dipindah sales, bot)
export type TimelineKind = "chat" | "status" | "note" | "update";

export type TimelineEntry = {
  id: string;
  kind: TimelineKind;
  at: string; // waktu kejadian (ISO)
  activity?: LeadActivity; // terisi untuk status / note / update / chat lama
  message?: Message; // terisi untuk chat dari tabel messages
};

// Dua kejadian dianggap "sama" kalau selisih waktunya paling lama segini —
// dipakai mencocokkan salinan pesan di riwayat dengan pesan aslinya.
const SAME_EVENT_MS = 3 * 60 * 1000;

// Awalan catatan yang dibuat otomatis oleh aplikasi saat sales mengubah data
// (lihat ProspekTable, LeadDetail, mergeLeads) — bukan catatan yang diketik.
const SYSTEM_NOTE_PREFIXES = ["Lead data updated:", "Assigned to:", "Merged lead"];

// Catatan otomatis = ditulis bot (tanpa pembuat) atau berawalan di atas.
function noteKind(activity: LeadActivity): TimelineKind {
  const text = activity.content ?? "";
  const isSystem =
    activity.created_by === null ||
    SYSTEM_NOTE_PREFIXES.some((p) => text.startsWith(p));
  return isSystem ? "update" : "note";
}

// Pesan keluar di riwayat aktivitas selalu diawali "→" (lihat
// logWhatsappActivity di inbox/actions.ts & botRunner.ts).
function activityDirection(activity: LeadActivity): "inbound" | "outbound" {
  return (activity.content ?? "").startsWith("→") ? "outbound" : "inbound";
}

function messageTime(message: Message): string {
  return message.wa_timestamp ?? message.created_at;
}

// Cari salinan riwayat (whatsapp_message) yang mewakili pesan asli ini:
// arah sama + waktunya berdekatan. Setiap salinan hanya dipakai sekali.
function findCopy(
  message: Message,
  copies: LeadActivity[],
  used: Set<string>,
): LeadActivity | undefined {
  const t = new Date(messageTime(message)).getTime();
  return copies.find(
    (a) =>
      !used.has(a.id) &&
      activityDirection(a) === message.direction &&
      Math.abs(new Date(a.created_at).getTime() - t) <= SAME_EVENT_MS,
  );
}

// Gabungkan riwayat aktivitas lead + pesan WhatsApp asli jadi satu timeline,
// terbaru di atas. Pesan WA juga punya salinan di riwayat aktivitas — salinan
// yang cocok dengan pesan asli dibuang supaya tidak tampil dobel. Salinan yang
// TIDAK punya pesan asli (mis. percakapan tidak bisa dibaca akun ini) tetap
// ditampilkan, jadi tidak ada chat yang hilang.
export function buildTimeline(
  activities: LeadActivity[],
  messages: Message[],
): TimelineEntry[] {
  const copies = activities.filter((a) => a.type === "whatsapp_message");
  const used = new Set<string>();
  const entries: TimelineEntry[] = [];

  for (const message of messages) {
    const copy = findCopy(message, copies, used);
    if (copy) used.add(copy.id);
    entries.push({
      id: `m-${message.id}`,
      kind: "chat",
      at: messageTime(message),
      message,
    });
  }

  for (const activity of activities) {
    if (used.has(activity.id)) continue;
    entries.push({
      id: `a-${activity.id}`,
      kind:
        activity.type === "whatsapp_message"
          ? "chat"
          : activity.type === "status_change"
            ? "status"
            : noteKind(activity),
      at: activity.created_at,
      activity,
    });
  }

  return entries.sort((a, b) => (a.at < b.at ? 1 : -1));
}

// Teks pengganti untuk pesan non-teks, mis. "[Image]".
export function messagePreview(message: Message): string {
  if (message.text_body) return message.text_body;
  const label = message.type.charAt(0).toUpperCase() + message.type.slice(1);
  return message.media_filename ? `[${label}: ${message.media_filename}]` : `[${label}]`;
}
