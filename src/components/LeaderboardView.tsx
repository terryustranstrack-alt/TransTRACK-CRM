"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSalesTarget } from "@/app/leaderboard/actions";
import CurrencyInput from "@/components/CurrencyInput";
import type { LeaderboardRow } from "@/lib/leaderboard";

function formatRupiah(n: number) {
  return n.toLocaleString("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });
}

// Tampilkan menit balas dengan satuan yang enak dibaca: "12 min", "3.5 h".
function formatReplyTime(minutes: number | null): string {
  if (minutes == null) return "-";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 24 * 60) return `${(minutes / 60).toFixed(1)} h`;
  return `${(minutes / 60 / 24).toFixed(1)} d`;
}

// Persen tercapai (maks 100 untuk lebar batang). Tanpa target → null.
function progressPercent(actual: number, target: number): number | null {
  if (target <= 0) return null;
  return Math.min(100, (actual / target) * 100);
}

function ProgressBar({ percent }: { percent: number | null }) {
  if (percent == null) return null;
  return (
    <div className="h-1.5 bg-[var(--color-muted-bg)] rounded-full overflow-hidden mt-1">
      <div
        className={`h-1.5 rounded-full ${
          percent >= 100 ? "bg-[var(--color-success)]" : "bg-brand"
        }`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

// Form kecil (khusus admin) untuk mengatur target satu sales di bulan ini.
function TargetEditor({
  row,
  month,
  onDone,
}: {
  row: LeaderboardRow;
  month: string;
  onDone: () => void;
}) {
  const [won, setWon] = useState(String(row.targetWon || ""));
  const [value, setValue] = useState(row.targetValue ? String(row.targetValue) : "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await setSalesTarget(
        row.profileId,
        month,
        Number(won) || 0,
        Number(value) || 0,
      );
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <input
        type="number"
        min={0}
        value={won}
        onChange={(e) => setWon(e.target.value)}
        placeholder="Deals"
        aria-label="Target deals won"
        className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-20"
      />
      <CurrencyInput
        value={value}
        onChange={setValue}
        className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-36"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="bg-brand text-on-brand hover:bg-[var(--color-brand-hover)] rounded-lg px-2 py-1 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={onDone}
        className="text-[var(--color-muted)] hover:underline"
      >
        Cancel
      </button>
      {error && <span className="text-[var(--color-danger)]">{error}</span>}
    </div>
  );
}

// Halaman Leaderboard: per sales di bulan terpilih — lead baru, deal Won &
// nilainya dibanding target (batang progres), dan kecepatan balas WhatsApp.
// Baris milik user yang sedang login diberi tanda supaya mudah ditemukan.
export default function LeaderboardView({
  month,
  profiles,
  rows,
  isAdmin,
  currentUserId,
}: {
  month: string;
  profiles: { id: string; label: string }[];
  rows: LeaderboardRow[];
  isAdmin: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);

  function nameOf(profileId: string): string {
    return profiles.find((p) => p.id === profileId)?.label ?? "Unknown";
  }

  return (
    <main className="p-4 sm:p-8 flex flex-col gap-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
        <input
          type="month"
          value={month}
          onChange={(e) =>
            e.target.value && router.push(`/leaderboard?month=${e.target.value}`)
          }
          aria-label="Month"
          className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">No sales accounts yet.</p>
      ) : (
        <div className="overflow-x-auto border border-[var(--color-border)] rounded-xl">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[var(--color-muted-bg)] border-b border-[var(--color-border)] text-left">
                <th className="p-3 w-8">#</th>
                <th className="p-3">Salesperson</th>
                <th className="p-3 text-right">New leads</th>
                <th className="p-3 min-w-36">Deals won</th>
                <th className="p-3 min-w-44">Value won</th>
                <th className="p-3 text-right" title="Average time from a customer's WhatsApp message to the first human reply">
                  Avg reply time
                </th>
                {isAdmin && <th className="p-3">Target</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.profileId}
                  className={`border-b border-[var(--color-border)] last:border-0 align-top ${
                    row.profileId === currentUserId ? "bg-[var(--color-muted-bg)]" : ""
                  }`}
                >
                  <td className="p-3 font-data text-[var(--color-muted)]">{index + 1}</td>
                  <td className="p-3 font-medium">
                    {nameOf(row.profileId)}
                    {row.profileId === currentUserId && (
                      <span className="text-xs text-[var(--color-muted)] font-normal"> (you)</span>
                    )}
                  </td>
                  <td className="p-3 text-right font-data">{row.newLeads}</td>
                  <td className="p-3 font-data">
                    {row.won}
                    {row.targetWon > 0 && (
                      <span className="text-[var(--color-muted)]"> / {row.targetWon}</span>
                    )}
                    <ProgressBar percent={progressPercent(row.won, row.targetWon)} />
                  </td>
                  <td className="p-3 font-data whitespace-nowrap">
                    {formatRupiah(row.wonValue)}
                    {row.targetValue > 0 && (
                      <span className="text-[var(--color-muted)]">
                        {" "}/ {formatRupiah(row.targetValue)}
                      </span>
                    )}
                    <ProgressBar percent={progressPercent(row.wonValue, row.targetValue)} />
                  </td>
                  <td className="p-3 text-right font-data">
                    {formatReplyTime(row.avgReplyMinutes)}
                    {row.replies > 0 && (
                      <span className="block text-xs text-[var(--color-muted)]">
                        {row.replies} chats
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="p-3">
                      {editingId === row.profileId ? (
                        <TargetEditor
                          row={row}
                          month={month}
                          onDone={() => {
                            setEditingId(null);
                            router.refresh();
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingId(row.profileId)}
                          className="border border-[var(--color-border)] rounded-lg px-2 py-1 text-xs hover:bg-[var(--color-muted-bg)]"
                        >
                          {row.targetWon > 0 || row.targetValue > 0 ? "Edit target" : "Set target"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-[var(--color-muted)]">
        Deals won count leads marked Won in this month. Reply time measures how
        fast a person (not the bot) answers a customer&apos;s WhatsApp message.
      </p>
    </main>
  );
}
