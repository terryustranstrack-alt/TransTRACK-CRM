"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { useProfiles, profileLabel } from "@/lib/useProfiles";
import { ALL_TIME, inDateRange, type DateRange } from "@/lib/dateRange";
import StatTile from "@/components/StatTile";
import type { Conversation } from "@/lib/types";

// Irisan kecil dari tabel leads — cuma untuk menghitung berapa yang dibuat
// otomatis oleh bot, per brand dan per periode.
type BotLeadSlice = { id: string; brand_id: string | null; tanggal_masuk: string };

const supabase = createClient();
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Mulai tanggal berapa pesan perlu diambil. Minimal 30 hari terakhir
// (untuk "Awaiting a reply"), atau lebih jauh kalau periode yang dipilih
// mulai lebih awal. `null` = ambil semua (All time / Custom tanpa "From").
function messagesSince(from: string): string | null {
  if (!from) return null;
  const thirtyDaysAgo = Date.now() - THIRTY_DAYS_MS;
  const rangeStart = new Date(`${from}T00:00:00`).getTime();
  return new Date(Math.min(thirtyDaysAgo, rangeStart)).toISOString();
}

// Irisan kecil dari tabel messages — cuma kolom yang dibutuhkan buat hitung
// metrik.
type MessageSlice = {
  conversation_id: string;
  direction: "inbound" | "outbound";
  sent_by_bot: boolean;
  wa_timestamp: string | null;
  created_at: string;
};

function messageTime(m: MessageSlice): number {
  return new Date(m.wa_timestamp ?? m.created_at).getTime();
}

// Kelompokkan pesan per percakapan, urutan aslinya (waktu naik) dipertahankan.
function groupByConversation(messages: MessageSlice[]): Map<string, MessageSlice[]> {
  const byConversation = new Map<string, MessageSlice[]>();
  for (const msg of messages) {
    const list = byConversation.get(msg.conversation_id) ?? [];
    list.push(msg);
    byConversation.set(msg.conversation_id, list);
  }
  return byConversation;
}

// Format durasi rata-rata balasan jadi teks pendek (detik / menit / jam).
function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

// Blok metrik WhatsApp Inbox di halaman Dashboard: percakapan terbuka,
// yang menunggu dibalas, rata-rata waktu balasan pertama, dan sebaran
// beban per sales. Semua dihitung di sisi klien (pola sama seperti Dashboard).
// "Open conversations", "Awaiting a reply" dan beban per sales = kondisi saat
// ini; balasan bot, waktu balasan pertama, dan lead dari bot ikut `dateRange`.
export default function ChatMetrics({
  brandFilter = "all",
  dateRange = ALL_TIME,
}: {
  brandFilter?: string;
  dateRange?: DateRange;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<MessageSlice[]>([]);
  const [botLeads, setBotLeads] = useState<BotLeadSlice[]>([]);
  const [loading, setLoading] = useState(true);
  const profiles = useProfiles();

  // Percakapan & lead dari bot cukup diambil sekali.
  useEffect(() => {
    async function load() {
      const [conversationsResult, botLeadsResult] = await Promise.all([
        supabase.from("conversations").select("*"),
        // Lead yang dibuat otomatis oleh bot (mengikuti RLS: sales biasa
        // melihat miliknya sendiri, admin melihat semua) — brand_id &
        // tanggal masuk ikut diambil supaya bisa dipersempit di bawah.
        supabase
          .from("leads")
          .select("id, brand_id, tanggal_masuk")
          .eq("created_by_bot", true),
      ]);
      if (conversationsResult.data) {
        setConversations(conversationsResult.data as Conversation[]);
      }
      if (botLeadsResult.data) {
        setBotLeads(botLeadsResult.data as BotLeadSlice[]);
      }
    }
    load();
  }, []);

  // Pesan diambil ulang setiap tanggal awal periode berubah (halaman demi
  // halaman, supaya tidak terpotong di 1000 pesan).
  const rangeFrom = dateRange.from;
  useEffect(() => {
    let cancelled = false;
    const since = messagesSince(rangeFrom);
    fetchAll<MessageSlice>((from, to) => {
      let query = supabase
        .from("messages")
        .select("conversation_id, direction, sent_by_bot, wa_timestamp, created_at");
      if (since) query = query.gte("wa_timestamp", since);
      return query.order("wa_timestamp", { ascending: true }).range(from, to);
    })
      .then((rows) => {
        if (!cancelled) setMessages(rows);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rangeFrom]);

  const stats = useMemo(() => {
    const conversationsInBrand =
      brandFilter === "all"
        ? conversations
        : conversations.filter((c) => c.brand_id === brandFilter);
    const conversationIds = new Set(conversationsInBrand.map((c) => c.id));
    const messagesInBrand = messages.filter((m) =>
      conversationIds.has(m.conversation_id),
    );
    const botLeadCount = botLeads.filter(
      (l) =>
        (brandFilter === "all" || l.brand_id === brandFilter) &&
        inDateRange(l.tanggal_masuk, dateRange),
    ).length;

    const openConversations = conversationsInBrand.filter(
      (c) => c.status !== "resolved",
    );

    // Kelompokkan pesan per percakapan (sudah terurut naik dari query).
    const messagesByConversation = groupByConversation(messagesInBrand);
    // Pesan yang terkirim/diterima di dalam periode yang dipilih.
    const messagesInRange = messagesInBrand.filter((m) =>
      inDateRange(m.wa_timestamp ?? m.created_at, dateRange),
    );

    // "Menunggu dibalas" = percakapan terbuka yang pesan terakhirnya dari kontak.
    let unanswered = 0;
    for (const c of openConversations) {
      const msgs = messagesByConversation.get(c.id);
      if (msgs && msgs.length > 0 && msgs[msgs.length - 1].direction === "inbound") {
        unanswered += 1;
      }
    }

    // Waktu balasan pertama: dari pesan masuk pertama ke pesan keluar pertama
    // sesudahnya (di dalam periode), dirata-ratakan.
    const replyDeltas: number[] = [];
    for (const msgs of groupByConversation(messagesInRange).values()) {
      const firstInbound = msgs.find((m) => m.direction === "inbound");
      if (!firstInbound) continue;
      const inboundAt = messageTime(firstInbound);
      const firstReply = msgs.find(
        (m) => m.direction === "outbound" && messageTime(m) > inboundAt,
      );
      if (firstReply) replyDeltas.push(messageTime(firstReply) - inboundAt);
    }
    const avgReplyMs =
      replyDeltas.length > 0
        ? replyDeltas.reduce((a, b) => a + b, 0) / replyDeltas.length
        : null;

    // Balasan yang dikirim otomatis oleh chatbot (di dalam periode).
    const botReplies = messagesInRange.filter(
      (m) => m.direction === "outbound" && m.sent_by_bot,
    ).length;

    // Percakapan terbuka per sales (+ baris "Unclaimed").
    const perSales = profiles.map((p) => ({
      name: profileLabel(p),
      count: openConversations.filter((c) => c.assigned_to === p.id).length,
    }));
    perSales.push({
      name: "Unclaimed",
      count: openConversations.filter((c) => !c.assigned_to).length,
    });

    return {
      openCount: openConversations.length,
      unanswered,
      avgReplyMs,
      botReplies,
      botLeadCount,
      perSales: perSales.filter((s) => s.count > 0),
    };
  }, [conversations, messages, botLeads, profiles, brandFilter, dateRange]);

  if (loading) {
    return <div className="skeleton h-56" aria-label="Loading chat metrics" />;
  }

  const maxCount = Math.max(1, ...stats.perSales.map((s) => s.count));

  // Satu kartu "WhatsApp Inbox": angka chat & chatbot di kiri, beban chat
  // per orang di kanan (di telepon bertumpuk).
  return (
    <section className="card p-5 flex flex-col gap-4">
      <div>
        <h2 className="card-title">WhatsApp Inbox</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Open and awaiting counts are live; reply time and bot numbers follow
          the selected period
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatTile label="Open conversations" value={stats.openCount} />
          <StatTile label="Awaiting a reply" value={stats.unanswered} tone="warning" />
          <StatTile label="Avg. first reply" value={formatDuration(stats.avgReplyMs)} />
          <StatTile label="Bot replies sent" value={stats.botReplies} tone="ai" />
          <StatTile label="Leads captured by bot" value={stats.botLeadCount} tone="ai" />
        </div>

        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--color-muted)] mb-3">
            Open conversations by person
          </p>
          {stats.perSales.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">No open conversations.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {stats.perSales.map((s) => (
                <div key={s.name} className="flex items-center gap-2 text-sm">
                  <span className="w-28 shrink-0 truncate">{s.name}</span>
                  <div className="flex-1 h-2 bg-[var(--color-muted-bg)] rounded-full overflow-hidden">
                    <div
                      className="h-2 bg-brand rounded-full"
                      style={{ width: `${(s.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="font-data w-6 text-right text-xs">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
