"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { profileLabel } from "@/lib/useProfiles";
import {
  buildTimeline,
  messagePreview,
  type TimelineEntry,
  type TimelineKind,
} from "@/lib/timeline";
import {
  leadStatusLabel,
  type LeadActivity,
  type Message,
  type Profile,
} from "@/lib/types";

const supabase = createClient();
const MAX_MESSAGES = 500;

const FILTERS: { key: TimelineKind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "chat", label: "Chats" },
  { key: "status", label: "Stage changes" },
  { key: "note", label: "Notes" },
  { key: "update", label: "Updates" },
];

// Warna titik penanda tiap jenis entri (garis waktu di sisi kiri).
const DOT_CLASS: Record<TimelineKind, string> = {
  chat: "bg-[var(--color-success)]",
  status: "bg-brand",
  note: "bg-[var(--color-warning)]",
  update: "bg-[var(--color-border)]",
};

// Ambil semua pesan WhatsApp dari percakapan yang terhubung ke lead ini
// (bisa lebih dari satu kalau kontaknya menghubungi beberapa nomor brand).
// Yang tidak boleh dibaca akun ini otomatis tersaring oleh aturan akses.
async function fetchLeadMessages(leadId: string): Promise<Message[]> {
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id")
    .eq("lead_id", leadId);
  const ids = (conversations ?? []).map((c) => c.id);
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("messages")
    .select("*")
    .in("conversation_id", ids)
    .order("created_at", { ascending: false })
    .limit(MAX_MESSAGES);
  return (data ?? []) as Message[];
}

// Siapa pelaku sebuah entri: nama sales, "AI bot", nama pelanggan, atau
// "System" untuk catatan otomatis tanpa pembuat.
function authorOf(
  entry: TimelineEntry,
  leadName: string,
  profiles: Profile[],
): string {
  const nameOf = (id: string | null) => {
    const p = profiles.find((x) => x.id === id);
    return p ? profileLabel(p) : null;
  };
  if (entry.message) {
    if (entry.message.direction === "inbound") return leadName;
    if (entry.message.sent_by_bot) return "AI bot";
    return nameOf(entry.message.sent_by) ?? "Team";
  }
  const a = entry.activity!;
  if (a.type === "whatsapp_message") {
    if (!(a.content ?? "").startsWith("→")) return leadName;
    if ((a.content ?? "").startsWith("→ (bot)")) return "AI bot";
  }
  return nameOf(a.created_by) ?? "System";
}

// Isi utama satu entri timeline.
function EntryBody({ entry }: { entry: TimelineEntry }) {
  if (entry.message) {
    const m = entry.message;
    return (
      <p className="whitespace-pre-wrap">
        <span className="text-[var(--color-muted)]">
          {m.direction === "inbound" ? "WhatsApp in: " : "WhatsApp out: "}
        </span>
        {messagePreview(m)}
        {m.direction === "outbound" && m.status === "failed" && (
          <span className="text-[var(--color-danger)]"> (failed)</span>
        )}
      </p>
    );
  }

  const a = entry.activity!;
  if (a.type === "status_change") {
    return (
      <p>
        Stage changed from{" "}
        <span className="font-medium">
          {a.old_status ? leadStatusLabel(a.old_status) : "-"}
        </span>{" "}
        to{" "}
        <span className="font-medium">
          {a.new_status ? leadStatusLabel(a.new_status) : "-"}
        </span>
        {a.content && (
          <span className="block text-[var(--color-muted)]">{a.content}</span>
        )}
      </p>
    );
  }
  if (a.type === "whatsapp_message") {
    const text = (a.content ?? "").replace(/^→ (\(bot\) )?/, "");
    const outbound = (a.content ?? "").startsWith("→");
    return (
      <p className="whitespace-pre-wrap">
        <span className="text-[var(--color-muted)]">
          {outbound ? "WhatsApp out: " : "WhatsApp in: "}
        </span>
        {text}
      </p>
    );
  }
  return <p className="whitespace-pre-wrap">{a.content}</p>;
}

// Timeline lengkap satu lead di halaman detail: chat WhatsApp, perubahan
// tahap, catatan, dan perubahan data — satu daftar urut waktu (terbaru di
// atas) dengan tombol filter per jenis. `activities` datang dari LeadDetail
// (yang juga mengurus form "Add Note"); pesan WA diambil sendiri di sini dan
// dimuat ulang setiap kali `activities` berubah.
export default function LeadTimeline({
  leadId,
  leadName,
  activities,
  profiles,
}: {
  leadId: string;
  leadName: string;
  activities: LeadActivity[];
  profiles: Profile[];
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<TimelineKind | "all">("all");

  useEffect(() => {
    let cancelled = false;
    fetchLeadMessages(leadId).then((rows) => {
      if (!cancelled) setMessages(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [leadId, activities]);

  const entries = useMemo(
    () => buildTimeline(activities, messages),
    [activities, messages],
  );
  const visible =
    filter === "all" ? entries : entries.filter((e) => e.kind === filter);

  function countOf(key: TimelineKind | "all"): number {
    return key === "all" ? entries.length : entries.filter((e) => e.kind === key).length;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter timeline">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              filter === key
                ? "bg-brand text-on-brand border-transparent"
                : "border-[var(--color-border)] hover:bg-[var(--color-muted-bg)]"
            }`}
          >
            {label} <span className="font-data opacity-70">{countOf(key)}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">Nothing here yet.</p>
      ) : (
        <ol className="flex flex-col border-l border-[var(--color-border)] ml-1.5">
          {visible.map((entry) => (
            <li key={entry.id} className="relative pl-5 pb-4 text-sm">
              <span
                aria-hidden="true"
                className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ${DOT_CLASS[entry.kind]}`}
              />
              <p className="text-xs text-[var(--color-muted)] mb-0.5">
                <span className="font-medium text-foreground">
                  {authorOf(entry, leadName, profiles)}
                </span>
                {" · "}
                {new Date(entry.at).toLocaleString("id-ID")}
              </p>
              <EntryBody entry={entry} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
