"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logNote, logStatusChange } from "@/lib/activity";
import { useSumberOptions } from "@/lib/useSumberOptions";
import { useProfiles, profileLabel } from "@/lib/useProfiles";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { useBrands } from "@/lib/useBrands";
import SumberSelect from "@/components/SumberSelect";
import AssigneeSelect from "@/components/AssigneeSelect";
import CurrencyInput from "@/components/CurrencyInput";
import {
  buildLeadUpdate,
  leadToEditForm,
  type LeadEditForm,
} from "@/lib/leadEdit";
import {
  downloadCsv,
  leadsToCsv,
  parseLeadsCsv,
  type NewLeadInput,
} from "@/lib/csv";
import { needsFollowUp, nextStepState } from "@/lib/reminders";
import { groupDuplicates, sameContact } from "@/lib/duplicates";
import {
  LEAD_STATUSES,
  leadStatusLabel,
  type Lead,
  type LeadStatus,
  type Profile,
} from "@/lib/types";

// Ubah timestamp ISO jadi format "YYYY-MM-DD" versi waktu lokal browser,
// supaya bisa dicocokkan dengan nilai <input type="date"> (filter tanggal).
// Tidak pakai iso.slice(0, 10) karena itu tanggal UTC, bisa beda hari
// dengan tanggal lokal pengguna.
function toLocalDateInputValue(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const supabase = createClient();

// Nilai awal form edit sebelum ada baris yang dipilih. Bentuknya sama dengan
// LeadEditForm (dipakai bareng LeadDetail lewat src/lib/leadEdit.ts).
const EMPTY_EDIT_FORM: LeadEditForm = {
  nama: "",
  kontak: "",
  sumber: "",
  produk: "",
  estimasi_nilai: "",
  kota: "",
  perusahaan: "",
  jabatan: "",
  email: "",
  catatan: "",
  next_step: "",
  next_step_due: "",
  assigned_to: "",
};

// Tampilan "Possible duplicates": tiap kartu = satu grup lead yang nomor
// telepon / email-nya sama. Admin dapat tombol untuk membuka layar merge
// (menggabungkan dua lead pertama di grup); sales biasa hanya melihat
// daftarnya (merge dibatasi admin).
function DuplicatesPanel({
  groups,
  profiles,
  isAdmin,
}: {
  groups: Lead[][];
  profiles: Profile[];
  isAdmin: boolean;
}) {
  if (groups.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted)] p-4 border border-[var(--color-border)] rounded-xl">
        No possible duplicates found — every lead has a unique phone and email.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div
          key={group[0].id}
          className="border border-[var(--color-border)] rounded-xl p-4 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">
              {group.length} leads share a phone or email
            </span>
            {isAdmin && (
              <Link
                href={`/leads/${group[0].id}/merge?with=${group[1].id}`}
                className="bg-brand text-on-brand hover:bg-[var(--color-brand-hover)] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              >
                Review &amp; merge
              </Link>
            )}
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <tbody>
              {group.map((lead) => {
                const owner = profiles.find((p) => p.id === lead.assigned_to);
                return (
                  <tr key={lead.id} className="border-t border-[var(--color-border)]">
                    <td className="py-2 pr-3">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-medium hover:underline"
                      >
                        {lead.nama}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{lead.kontak}</td>
                    <td className="py-2 pr-3">{lead.email || "-"}</td>
                    <td className="py-2 pr-3">{leadStatusLabel(lead.status)}</td>
                    <td className="py-2 pr-3 text-[var(--color-muted)]">
                      {owner ? profileLabel(owner) : "Unassigned"}
                    </td>
                    <td className="py-2 text-[var(--color-muted)] whitespace-nowrap">
                      {new Date(lead.tanggal_masuk).toLocaleDateString("id-ID")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// Halaman "Prospects": tabel semua lead dengan pencarian, filter
// follow-up/tanggal, edit inline per baris, serta export/import CSV.
export default function ProspekTable() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [followUpOnly, setFollowUpOnly] = useState(false);
  const [filterDate, setFilterDate] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const brands = useBrands();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<LeadEditForm>(EMPTY_EDIT_FORM);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sumberOptions = useSumberOptions();
  const profiles = useProfiles();
  const { profile: currentProfile } = useCurrentProfile();

  async function loadLeads() {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("nama", { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setLeads(data as Lead[]);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLeads();
  }, []);

  // Terapkan pencarian nama + filter follow-up + filter tanggal sekaligus
  // ke daftar lead. Dihitung ulang otomatis tiap kali salah satu filter
  // berubah (useMemo).
  const filteredLeads = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (keyword && !lead.nama.toLowerCase().includes(keyword)) return false;
      if (
        followUpOnly &&
        !needsFollowUp(lead.status, lead.tanggal_update, lead.next_step_due)
      ) {
        return false;
      }
      if (
        filterDate &&
        toLocalDateInputValue(lead.tanggal_update) !== filterDate
      ) {
        return false;
      }
      if (brandFilter !== "all" && lead.brand_id !== brandFilter) return false;
      return true;
    });
  }, [leads, search, followUpOnly, filterDate, brandFilter]);

  // Grup lead yang nomor/email-nya sama — untuk tampilan "Possible duplicates".
  const duplicateGroups = useMemo(() => groupDuplicates(leads), [leads]);

  // Baca file CSV yang dipilih user, parse jadi baris-baris lead lewat
  // parseLeadsCsv, lalu insert semuanya sekaligus ke database.
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    setImportMessage(null);

    const text = await file.text();
    const { rows, skipped } = parseLeadsCsv(text);

    if (rows.length === 0) {
      setImportMessage(
        `No valid rows to import (${skipped} row(s) skipped due to missing name/contact).`,
      );
      setImporting(false);
      return;
    }

    // Lewati baris yang nomor/email-nya sama dengan lead yang sudah ada, atau
    // sama dengan baris lain yang lebih dulu di file yang sama.
    const kept: NewLeadInput[] = [];
    const duplicateNames: string[] = [];
    for (const row of rows) {
      const against = { kontak: row.kontak, email: row.email };
      const matchesExisting = leads.some((lead) => sameContact(against, lead));
      const matchesEarlierRow = kept.some((k) =>
        sameContact(against, { kontak: k.kontak, email: k.email }),
      );
      if (matchesExisting || matchesEarlierRow) {
        duplicateNames.push(row.nama);
        continue;
      }
      kept.push(row);
    }

    if (kept.length === 0) {
      setImportMessage(
        `Nothing imported — all ${duplicateNames.length} row(s) look like duplicates` +
          (skipped > 0
            ? `, plus ${skipped} skipped for missing name/contact.`
            : "."),
      );
      setImporting(false);
      return;
    }

    const { error } = await supabase.from("leads").insert(kept);

    setImporting(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Ringkasan: berapa masuk, berapa dilewati karena duplikat (dengan
    // sebagian namanya), berapa dilewati karena data kurang.
    const parts = [`${kept.length} prospect(s) imported`];
    if (duplicateNames.length > 0) {
      const preview = duplicateNames.slice(0, 5).join(", ");
      const more = duplicateNames.length > 5 ? "…" : "";
      parts.push(
        `${duplicateNames.length} skipped as likely duplicates (${preview}${more})`,
      );
    }
    if (skipped > 0) parts.push(`${skipped} skipped for missing name/contact`);
    setImportMessage(parts.join("; ") + ".");
    loadLeads();
  }

  function startEdit(lead: Lead) {
    setEditingId(lead.id);
    setEditForm(leadToEditForm(lead));
  }

  async function handleStatusChange(lead: Lead, status: LeadStatus) {
    if (status === lead.status) return;

    const { error } = await supabase
      .from("leads")
      .update({ status, tanggal_update: new Date().toISOString() })
      .eq("id", lead.id);

    if (error) {
      setError(error.message);
      return;
    }
    const activityError = await logStatusChange(
      supabase,
      lead.id,
      lead.status,
      status,
    );
    if (activityError) setError(activityError);
    loadLeads();
  }

  // Simpan perubahan dari form edit baris ini. Payload update + daftar field
  // yang berubah dibangun di buildLeadUpdate (dipakai bareng LeadDetail).
  // Ringkasan perubahannya dicatat ke riwayat aktivitas.
  async function handleSaveEdit(lead: Lead) {
    setSaving(true);

    const { update, changedLabels } = buildLeadUpdate(
      editForm,
      lead,
      !!currentProfile?.is_admin,
    );

    const { error } = await supabase
      .from("leads")
      .update(update)
      .eq("id", lead.id);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    if (changedLabels.length > 0) {
      const activityError = await logNote(
        supabase,
        lead.id,
        `Lead data updated: ${changedLabels.join(", ")}.`,
      );
      if (activityError) setError(activityError);
    }

    setSaving(false);
    setEditingId(null);
    loadLeads();
  }

  if (loading) {
    return <p className="p-8 text-sm text-[var(--color-muted)]">Loading prospects...</p>;
  }
  if (error) {
    return <p className="p-8 text-sm text-[var(--color-danger)]">Failed to load: {error}</p>;
  }

  return (
    <main className="p-4 sm:p-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Prospects</h1>
          <Link
            href="/leads/baru"
            className="bg-brand text-on-brand hover:bg-[var(--color-brand-hover)] rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            + Add Lead
          </Link>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name..."
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm w-64"
          />
          {currentProfile?.is_admin && brands.length > 1 && (
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">All brands</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-2 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={followUpOnly}
              onChange={(e) => setFollowUpOnly(e.target.checked)}
            />
            Needs follow-up
          </label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
          />
          {filterDate && (
            <button
              type="button"
              onClick={() => setFilterDate("")}
              className="text-sm text-[var(--color-muted)] hover:underline"
            >
              Clear date filter
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const brandNames = Object.fromEntries(
                brands.map((b) => [b.id, b.name]),
              );
              downloadCsv(
                `leads-${Date.now()}.csv`,
                leadsToCsv(leads, brandNames),
              );
            }}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-muted-bg)]"
          >
            Export CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-muted-bg)] disabled:opacity-50"
          >
            {importing ? "Importing..." : "Import CSV"}
          </button>
          <button
            type="button"
            onClick={() => setShowDuplicates((v) => !v)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-muted-bg)]"
          >
            {showDuplicates
              ? "Back to list"
              : `Possible duplicates${
                  duplicateGroups.length > 0
                    ? ` (${duplicateGroups.length})`
                    : ""
                }`}
          </button>
        </div>
      </div>

      {importMessage && (
        <p className="text-sm text-[var(--color-muted)]">{importMessage}</p>
      )}

      {showDuplicates ? (
        <DuplicatesPanel
          groups={duplicateGroups}
          profiles={profiles}
          isAdmin={!!currentProfile?.is_admin}
        />
      ) : (
      <div className="overflow-x-auto border border-[var(--color-border)] rounded-xl">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-[var(--color-muted-bg)] border-b border-[var(--color-border)] text-left">
              <th className="p-2">Name</th>
              <th className="p-2">Contact</th>
              <th className="p-2">Source</th>
              <th className="p-2">Company</th>
              <th className="p-2">City</th>
              <th className="p-2">Product</th>
              <th className="p-2">Estimated Value</th>
              <th className="p-2">Next Step</th>
              <th className="p-2">Assignee</th>
              <th className="p-2">Status</th>
              <th className="p-2">Last Updated</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.length === 0 && (
              <tr>
                <td colSpan={12} className="p-4 text-center text-[var(--color-muted)]">
                  No matching prospects.
                </td>
              </tr>
            )}
            {filteredLeads.map((lead) => {
              const isEditing = editingId === lead.id;
              return (
                <tr key={lead.id} className="border-b align-top">
                  {isEditing ? (
                    <>
                      <td className="p-2">
                        <input
                          value={editForm.nama}
                          onChange={(e) =>
                            setEditForm({ ...editForm, nama: e.target.value })
                          }
                          className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={editForm.kontak}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              kontak: e.target.value,
                            })
                          }
                          className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full"
                        />
                      </td>
                      <td className="p-2 min-w-40">
                        <SumberSelect
                          value={editForm.sumber}
                          onChange={(sumber) =>
                            setEditForm({ ...editForm, sumber })
                          }
                          options={sumberOptions}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={editForm.perusahaan}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              perusahaan: e.target.value,
                            })
                          }
                          className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={editForm.kota}
                          onChange={(e) =>
                            setEditForm({ ...editForm, kota: e.target.value })
                          }
                          className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={editForm.produk}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              produk: e.target.value,
                            })
                          }
                          className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full"
                        />
                      </td>
                      <td className="p-2">
                        <CurrencyInput
                          value={editForm.estimasi_nilai}
                          onChange={(estimasi_nilai) =>
                            setEditForm({
                              ...editForm,
                              estimasi_nilai,
                            })
                          }
                          className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full"
                        />
                      </td>
                      <td className="p-2 min-w-44">
                        <input
                          value={editForm.next_step}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              next_step: e.target.value,
                            })
                          }
                          placeholder="Next step"
                          className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full mb-1"
                        />
                        <input
                          type="date"
                          value={editForm.next_step_due}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              next_step_due: e.target.value,
                            })
                          }
                          className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full"
                        />
                      </td>
                      <td className="p-2 min-w-40">
                        {currentProfile?.is_admin ? (
                          <AssigneeSelect
                            value={editForm.assigned_to || null}
                            onChange={(assigned_to) =>
                              setEditForm({
                                ...editForm,
                                assigned_to: assigned_to ?? "",
                              })
                            }
                            profiles={profiles}
                          />
                        ) : (
                          <span className="text-[var(--color-muted)]">
                            {currentProfile ? profileLabel(currentProfile) : "-"}
                          </span>
                        )}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-2">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="font-medium hover:underline"
                        >
                          {lead.nama}
                        </Link>
                      </td>
                      <td className="p-2">{lead.kontak}</td>
                      <td className="p-2">{lead.sumber || "-"}</td>
                      <td className="p-2">{lead.perusahaan || "-"}</td>
                      <td className="p-2">{lead.kota || "-"}</td>
                      <td className="p-2">{lead.produk || "-"}</td>
                      <td className="p-2">
                        {lead.estimasi_nilai != null
                          ? lead.estimasi_nilai.toLocaleString("id-ID")
                          : "-"}
                      </td>
                      <td className="p-2 min-w-44">
                        {lead.next_step || lead.next_step_due ? (
                          <>
                            <div>{lead.next_step || "-"}</div>
                            {lead.next_step_due &&
                              (() => {
                                const state = nextStepState(lead.next_step_due);
                                const dueText = new Date(
                                  lead.next_step_due,
                                ).toLocaleDateString("id-ID");
                                const cls =
                                  state === "overdue"
                                    ? "text-[var(--color-danger)] font-medium"
                                    : state === "today"
                                      ? "text-[var(--color-warning)] font-medium"
                                      : "text-[var(--color-muted)]";
                                return (
                                  <div className={`text-xs ${cls}`}>
                                    {dueText}
                                    {state === "overdue" && " · overdue"}
                                    {state === "today" && " · today"}
                                  </div>
                                );
                              })()}
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="p-2">
                        {(() => {
                          const assignee = profiles.find(
                            (p) => p.id === lead.assigned_to,
                          );
                          return assignee ? profileLabel(assignee) : "-";
                        })()}
                      </td>
                    </>
                  )}

                  <td className="p-2">
                    <select
                      value={lead.status}
                      onChange={(e) =>
                        handleStatusChange(
                          lead,
                          e.target.value as LeadStatus,
                        )
                      }
                      className="border border-[var(--color-border)] rounded-lg text-sm px-2 py-1"
                    >
                      {LEAD_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {leadStatusLabel(s)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 text-[var(--color-muted)] whitespace-nowrap">
                    {new Date(lead.tanggal_update).toLocaleString("id-ID")}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(lead)}
                          disabled={saving}
                          className="bg-brand text-on-brand hover:bg-[var(--color-brand-hover)] rounded-lg px-2 py-1 text-xs transition-colors disabled:opacity-50"
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          disabled={saving}
                          className="border border-[var(--color-border)] rounded-lg px-2 py-1 text-xs hover:bg-[var(--color-muted-bg)]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(lead)}
                        className="border border-[var(--color-border)] rounded-lg px-2 py-1 text-xs hover:bg-[var(--color-muted-bg)]"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </main>
  );
}
