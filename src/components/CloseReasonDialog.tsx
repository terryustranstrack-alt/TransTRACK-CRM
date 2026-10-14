"use client";

import { useState, type FormEvent } from "react";
import { changeLeadStatus } from "@/lib/leadStatus";
import {
  isFinalStatus,
  reasonRequired,
  reasonsFor,
  type CloseDetails,
} from "@/lib/closeReasons";
import { leadStatusLabel, type LeadStatus } from "@/lib/types";

// Jendela kecil yang muncul saat lead dipindah ke Won/Lost: minta alasan
// (wajib untuk Lost) + catatan opsional. `count` > 1 saat dipakai untuk
// ubah status banyak lead sekaligus (bulk action di Prospects).
export function CloseReasonDialog({
  status,
  count,
  onConfirm,
  onCancel,
}: {
  status: LeadStatus;
  count: number;
  onConfirm: (close: CloseDetails) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const required = reasonRequired(status);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (required && !reason) return;
    onConfirm({ reason, note });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-reason-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl bg-[var(--color-surface)] p-5 flex flex-col gap-4 shadow-xl"
      >
        <div>
          <h2 id="close-reason-title" className="font-semibold">
            Mark {count > 1 ? `${count} leads` : "lead"} as{" "}
            {leadStatusLabel(status)}
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            {required
              ? "Why was this deal lost? This feeds the reports."
              : "Why was this deal won? (optional)"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {reasonsFor(status).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r === reason ? "" : r)}
              aria-pressed={r === reason}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                r === reason
                  ? "bg-brand text-on-brand border-transparent"
                  : "border-[var(--color-border)] hover:bg-[var(--color-muted-bg)]"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Extra detail (optional)"
          rows={2}
          className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-muted-bg)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={required && !reason}
            className="bg-brand text-on-brand hover:bg-[var(--color-brand-hover)] rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

type LeadRef = { id: string; status: LeadStatus };

// Dipakai semua layar yang bisa ganti status lead. Panggil
// `requestStatusChange(leads, status)`: kalau status tujuannya Won/Lost,
// dialog alasan muncul dulu; kalau tidak, langsung disimpan. Render `dialog`
// di mana saja di dalam komponen. `onDone` dipanggil setelah selesai (untuk
// muat ulang data), `onError` kalau ada yang gagal.
export function useLeadStatusChange(
  onDone: () => void,
  onError: (message: string) => void,
) {
  const [pending, setPending] = useState<{
    leads: LeadRef[];
    status: LeadStatus;
  } | null>(null);

  // Simpan status baru ke tiap lead satu per satu (tiap lead dapat catatan
  // riwayatnya sendiri), lalu beri tahu layar untuk muat ulang.
  async function apply(leads: LeadRef[], status: LeadStatus, close?: CloseDetails) {
    for (const lead of leads) {
      const error = await changeLeadStatus(lead.id, lead.status, status, close);
      if (error) onError(error);
    }
    onDone();
  }

  function requestStatusChange(leads: LeadRef[], status: LeadStatus) {
    const targets = leads.filter((l) => l.status !== status);
    if (targets.length === 0) return;
    if (isFinalStatus(status)) {
      setPending({ leads: targets, status });
    } else {
      apply(targets, status);
    }
  }

  const dialog = pending ? (
    <CloseReasonDialog
      status={pending.status}
      count={pending.leads.length}
      onCancel={() => setPending(null)}
      onConfirm={(close) => {
        setPending(null);
        apply(pending.leads, pending.status, close);
      }}
    />
  ) : null;

  return { requestStatusChange, dialog };
}
