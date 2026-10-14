"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logNote } from "@/lib/activity";
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
import { useLeadStatusChange } from "@/components/CloseReasonDialog";
import { useSavedFilters, type ProspectFilters } from "@/lib/useSavedFilters";
import { groupDuplicates, sameContact } from "@/lib/duplicates";
import {
  matchesDateRange,
  matchesKeyword,
  matchesSource,
  type LeadDateField,
} from "@/lib/leadFilters";
import {
  LEAD_STATUSES,
  leadStatusLabel,
  type Lead,
  type LeadStatus,
  type Profile,
} from "@/lib/types";

const supabase = createClient();

// Nilai khusus di dropdown "Assign to…" (aksi massal) untuk melepas
// penanggung jawab — dropdown tidak bisa pakai null sebagai value.
const UNASSIGN = "__unassigned__";

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
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dateField, setDateField] = useState<LeadDateField>("tanggal_masuk");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const {
    savedFilters,
    save: saveFilter,
    remove: removeFilter,
  } = useSavedFilters();
  const [activeViewId, setActiveViewId] = useState("");
  const [savingView, setSavingView] = useState(false);
  const [newViewName, setNewViewName] = useState("");

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

  // Terapkan semua filter sekaligus ke daftar lead: pencarian (semua kolom,
  // termasuk nama sales & status), sumber, follow-up, rentang tanggal, dan
  // brand. Dihitung ulang otomatis tiap kali salah satu filter berubah
  // (useMemo).
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const assignee = profiles.find((p) => p.id === lead.assigned_to);
      const extraText = [
        leadStatusLabel(lead.status),
        assignee ? profileLabel(assignee) : "",
      ];
      if (!matchesKeyword(lead, search, extraText)) return false;
      if (!matchesSource(lead, sourceFilter)) return false;
      if (
        followUpOnly &&
        !needsFollowUp(lead.status, lead.tanggal_update, lead.next_step_due)
      ) {
        return false;
      }
      if (!matchesDateRange(lead, dateField, dateFrom, dateTo)) return false;
      if (brandFilter !== "all" && lead.brand_id !== brandFilter) return false;
      return true;
    });
  }, [
    leads,
    profiles,
    search,
    sourceFilter,
    followUpOnly,
    dateField,
    dateFrom,
    dateTo,
    brandFilter,
  ]);

  // Ada filter yang sedang aktif? Dipakai untuk menampilkan tombol
  // "Clear filters".
  const hasActiveFilters =
    search.trim() !== "" ||
    sourceFilter !== "all" ||
    followUpOnly ||
    dateFrom !== "" ||
    dateTo !== "" ||
    brandFilter !== "all";

  // Isi semua filter sekaligus — dipakai saat membuka saved view.
  function applyFilters(f: ProspectFilters) {
    setSearch(f.search);
    setSourceFilter(f.sourceFilter);
    setFollowUpOnly(f.followUpOnly);
    setDateField(f.dateField);
    setDateFrom(f.dateFrom);
    setDateTo(f.dateTo);
    setBrandFilter(f.brandFilter);
  }

  // Kembalikan semua filter ke kondisi awal (tampilkan semua lead).
  function clearFilters() {
    applyFilters({
      search: "",
      sourceFilter: "all",
      followUpOnly: false,
      dateField: "tanggal_masuk",
      dateFrom: "",
      dateTo: "",
      brandFilter: "all",
    });
    setActiveViewId("");
  }

  // Buka saved view yang dipilih dari dropdown "Saved views".
  function handleOpenView(id: string) {
    setActiveViewId(id);
    const view = savedFilters.find((v) => v.id === id);
    if (view) applyFilters(view.filters);
  }

  // Simpan kombinasi filter yang sedang aktif dengan nama yang diketik user.
  async function handleSaveView(e: React.FormEvent) {
    e.preventDefault();
    const name = newViewName.trim();
    if (!name) return;
    const saveError = await saveFilter(name, {
      search,
      sourceFilter,
      followUpOnly,
      dateField,
      dateFrom,
      dateTo,
      brandFilter,
    });
    if (saveError) {
      setError(saveError);
      return;
    }
    setNewViewName("");
    setSavingView(false);
  }

  async function handleDeleteView() {
    if (!activeViewId) return;
    const deleteError = await removeFilter(activeViewId);
    if (deleteError) setError(deleteError);
    else setActiveViewId("");
  }

  // Lead yang dicentang DAN masih terlihat dengan filter sekarang — aksi
  // massal hanya berlaku untuk ini, supaya tidak ada lead "tersembunyi" yang
  // ikut berubah tanpa disadari.
  const selectedLeads = filteredLeads.filter((l) => selectedIds.has(l.id));
  const allVisibleSelected =
    filteredLeads.length > 0 && selectedLeads.length === filteredLeads.length;

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds(
      allVisibleSelected ? new Set() : new Set(filteredLeads.map((l) => l.id)),
    );
  }

  // Ganti penanggung jawab banyak lead sekaligus (khusus admin), lalu catat
  // ke riwayat tiap lead.
  async function handleBulkAssign(assignedTo: string | null) {
    const ids = selectedLeads.map((l) => l.id);
    if (ids.length === 0) return;

    const { error } = await supabase
      .from("leads")
      .update({ assigned_to: assignedTo, tanggal_update: new Date().toISOString() })
      .in("id", ids);
    if (error) {
      setError(error.message);
      return;
    }

    const assignee = profiles.find((p) => p.id === assignedTo);
    const label = assignee ? profileLabel(assignee) : "Unassigned";
    for (const id of ids) {
      const activityError = await logNote(supabase, id, `Assigned to: ${label}.`);
      if (activityError) setError(activityError);
    }
    setSelectedIds(new Set());
    loadLeads();
  }

  // Download CSV berisi `rows` — dipakai untuk "Export CSV" (semua yang
  // terlihat dengan filter sekarang) dan "Export selected".
  function exportLeads(rows: Lead[]) {
    const brandNames = Object.fromEntries(brands.map((b) => [b.id, b.name]));
    downloadCsv(`leads-${Date.now()}.csv`, leadsToCsv(rows, brandNames));
  }

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

  // Ganti status (satu baris ATAU banyak lead yang dicentang) lewat helper
  // bersama — Won/Lost minta alasan dulu. Setelah selesai, centang dikosongkan.
  const { requestStatusChange, dialog: closeReasonDialog } =
    useLeadStatusChange(() => {
      setSelectedIds(new Set());
      loadLeads();
    }, setError);

  function handleStatusChange(lead: Lead, status: LeadStatus) {
    requestStatusChange([lead], status);
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
            placeholder="Search name, source, company, phone..."
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm w-64"
          />
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All sources</option>
            {sumberOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
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
          <div className="flex flex-wrap items-center gap-2 border border-[var(--color-border)] rounded-lg px-3 py-1 text-sm">
            <select
              value={dateField}
              onChange={(e) => setDateField(e.target.value as LeadDateField)}
              aria-label="Date to filter by"
              className="bg-transparent py-1"
            >
              <option value="tanggal_masuk">Date added</option>
              <option value="tanggal_update">Last updated</option>
            </select>
            <span className="text-[var(--color-muted)]">from</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="From date"
              className="bg-transparent py-1"
            />
            <span className="text-[var(--color-muted)]">to</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="To date"
              className="bg-transparent py-1"
            />
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-[var(--color-muted)] hover:underline"
            >
              Clear filters
            </button>
          )}
          <div className="flex items-center gap-2">
            <select
              value={activeViewId}
              onChange={(e) => handleOpenView(e.target.value)}
              aria-label="Saved views"
              className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Saved views</option>
              {savedFilters.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            {activeViewId ? (
              <button
                type="button"
                onClick={handleDeleteView}
                className="text-sm text-[var(--color-muted)] hover:underline"
              >
                Delete view
              </button>
            ) : savingView ? (
              <form onSubmit={handleSaveView} className="flex items-center gap-2">
                <input
                  autoFocus
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  placeholder="View name"
                  className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm w-36"
                />
                <button
                  type="submit"
                  disabled={!newViewName.trim()}
                  className="bg-brand text-on-brand hover:bg-[var(--color-brand-hover)] rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setSavingView(false)}
                  className="text-sm text-[var(--color-muted)] hover:underline"
                >
                  Cancel
                </button>
              </form>
            ) : (
              hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => setSavingView(true)}
                  className="text-sm text-[var(--color-muted)] hover:underline"
                >
                  Save view
                </button>
              )
            )}
          </div>
          <button
            type="button"
            onClick={() => exportLeads(filteredLeads)}
            title="Exports the prospects currently shown (filters applied)"
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-muted-bg)]"
          >
            Export CSV ({filteredLeads.length})
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

      {!showDuplicates && selectedLeads.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted-bg)] px-4 py-2 text-sm">
          <span className="font-medium">{selectedLeads.length} selected</span>
          <select
            value=""
            onChange={(e) =>
              requestStatusChange(selectedLeads, e.target.value as LeadStatus)
            }
            aria-label="Change status of selected"
            className="border border-[var(--color-border)] rounded-lg px-2 py-1 bg-[var(--color-surface)]"
          >
            <option value="" disabled>
              Change status…
            </option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {leadStatusLabel(s)}
              </option>
            ))}
          </select>
          {currentProfile?.is_admin && (
            <select
              value=""
              onChange={(e) =>
                handleBulkAssign(
                  e.target.value === UNASSIGN ? null : e.target.value,
                )
              }
              aria-label="Assign selected to"
              className="border border-[var(--color-border)] rounded-lg px-2 py-1 bg-[var(--color-surface)]"
            >
              <option value="" disabled>
                Assign to…
              </option>
              <option value={UNASSIGN}>Unassigned</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {profileLabel(p)}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => exportLeads(selectedLeads)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-1 bg-[var(--color-surface)] hover:bg-[var(--color-muted-bg)]"
          >
            Export selected
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-[var(--color-muted)] hover:underline"
          >
            Clear selection
          </button>
        </div>
      )}
      {closeReasonDialog}

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
              <th className="p-2 w-8">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  aria-label="Select all shown prospects"
                />
              </th>
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
                <td colSpan={13} className="p-4 text-center text-[var(--color-muted)]">
                  No matching prospects.
                </td>
              </tr>
            )}
            {filteredLeads.map((lead) => {
              const isEditing = editingId === lead.id;
              return (
                <tr key={lead.id} className="border-b align-top">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(lead.id)}
                      onChange={() => toggleSelected(lead.id)}
                      aria-label={`Select ${lead.nama}`}
                    />
                  </td>
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
