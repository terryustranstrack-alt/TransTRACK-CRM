"use client";

import { createClient } from "@/lib/supabase/client";
import { logStatusChange } from "@/lib/activity";
import { isFinalStatus, type CloseDetails } from "@/lib/closeReasons";
import type { LeadStatus } from "@/lib/types";

const supabase = createClient();

// Kolom yang ikut diubah bersama status. Pindah ke Won/Lost → simpan alasan
// + tanggal closing. Pindah keluar dari Won/Lost (lead dibuka lagi) →
// kosongkan lagi, supaya laporan tidak menghitung alasan yang sudah basi.
function closeFields(
  newStatus: LeadStatus,
  close: CloseDetails | undefined,
): Record<string, string | null> {
  if (isFinalStatus(newStatus)) {
    return {
      close_reason: close?.reason || null,
      close_note: close?.note.trim() || null,
      closed_at: new Date().toISOString(),
    };
  }
  return { close_reason: null, close_note: null, closed_at: null };
}

// Teks alasan untuk riwayat aktivitas, mis. "Reason: Price — terlalu mahal".
function closeSummary(close: CloseDetails | undefined): string | undefined {
  if (!close?.reason) return undefined;
  const note = close.note.trim();
  return note ? `Reason: ${close.reason} — ${note}` : `Reason: ${close.reason}`;
}

// Ganti status sebuah lead dan catat perubahannya ke riwayat aktivitas.
// SATU-SATUNYA jalan ganti status dari UI (LeadDetail, LeadBoard,
// ProspekTable, panel lead di Inbox) supaya alasan Won/Lost selalu tersimpan.
// Return: pesan error kalau gagal, atau null kalau berhasil.
export async function changeLeadStatus(
  leadId: string,
  oldStatus: LeadStatus,
  newStatus: LeadStatus,
  close?: CloseDetails,
): Promise<string | null> {
  if (oldStatus === newStatus) return null;

  const { error } = await supabase
    .from("leads")
    .update({
      status: newStatus,
      tanggal_update: new Date().toISOString(),
      ...closeFields(newStatus, close),
    })
    .eq("id", leadId);
  if (error) return error.message;

  return logStatusChange(
    supabase,
    leadId,
    oldStatus,
    newStatus,
    closeSummary(close),
  );
}
